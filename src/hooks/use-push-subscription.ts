import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/auth-context";
import { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } from "@/lib/push-config";

type Status = "unsupported" | "denied" | "disabled" | "enabled" | "loading";

export function usePushSubscription() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setStatus("unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      setStatus(sub ? "enabled" : "disabled");
    } catch {
      setStatus("disabled");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    if (!user?.id) return;
    setBusy(true);
    try {
      const reg =
        (await navigator.serviceWorker.getRegistration("/sw.js")) ??
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus(perm === "denied" ? "denied" : "disabled");
        return;
      }

      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      const json = sub.toJSON();
      const endpoint = sub.endpoint;
      const p256dh = json.keys?.p256dh ?? "";
      const auth = json.keys?.auth ?? "";
      if (!endpoint || !p256dh || !auth) throw new Error("Subscription missing keys");

      const { error } = await supabase
        .from("push_subscriptions")
        .upsert(
          {
            user_id: user.id,
            endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent,
          },
          { onConflict: "user_id,endpoint" },
        );
      if (error) throw error;

      setStatus("enabled");
    } finally {
      setBusy(false);
    }
  }, [user?.id]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("disabled");
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, enable, disable, refresh };
}

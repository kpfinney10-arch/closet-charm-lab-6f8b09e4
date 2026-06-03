// Server-only helpers for Web Push delivery.
// Imported by server functions that need to send a push as a side effect
// of another action (e.g. case assignment). The publicly callable
// `sendPushToUser` server fn in `push.functions.ts` is a thin wrapper
// around this helper.
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// VAPID public key (must match the one the browser used to subscribe).
export const VAPID_PUBLIC_KEY =
  "BBYPr16VnvR7y7qyadXXwFEQSrqwgopcqxjFRiBi7jlVMv4CGSbz5aasiJFEUMk1weNuKY30e4g3yE2akqMPwVg";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
};

export type PushResult = {
  sent: number;
  removed: number;
  error?: string;
};

export async function sendPushToUserInternal(
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!privateKey || !subject) {
    console.error("VAPID env vars missing");
    return { sent: 0, removed: 0, error: "Push not configured" };
  }
  webpush.setVapidDetails(subject, VAPID_PUBLIC_KEY, privateKey);

  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) {
    console.error("Failed to load subscriptions:", error);
    return { sent: 0, removed: 0, error: error.message };
  }
  if (!subs || subs.length === 0) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  let removed = 0;
  const expiredIds: string[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (e: unknown) {
        const status = (e as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          expiredIds.push(s.id);
        } else {
          console.error("Push send failed:", e);
        }
      }
    }),
  );

  if (expiredIds.length > 0) {
    const { error: delErr } = await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .in("id", expiredIds);
    if (delErr) console.error("Failed to clean expired subs:", delErr);
    else removed = expiredIds.length;
  }

  return { sent, removed };
}

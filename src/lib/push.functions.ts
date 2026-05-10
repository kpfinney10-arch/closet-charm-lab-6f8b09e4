import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import webpush from "web-push";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// VAPID public key (must match the one the browser used to subscribe).
const VAPID_PUBLIC_KEY =
  "BBYPr16VnvR7y7qyadXXwFEQSrqwgopcqxjFRiBi7jlVMv4CGSbz5aasiJFEUMk1weNuKY30e4g3yE2akqMPwVg";

const Input = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
  url: z.string().min(1).max(500).optional(),
  tag: z.string().min(1).max(120).optional(),
  requireInteraction: z.boolean().optional(),
});

// Send a Web Push notification to every subscription a user has.
// Cleans up any subscription that the push service has expired (404/410).
export const sendPushToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
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
      .eq("user_id", data.userId);

    if (error) {
      console.error("Failed to load subscriptions:", error);
      return { sent: 0, removed: 0, error: error.message };
    }
    if (!subs || subs.length === 0) {
      return { sent: 0, removed: 0 };
    }

    const payload = JSON.stringify({
      title: data.title,
      body: data.body,
      url: data.url,
      tag: data.tag,
      requireInteraction: data.requireInteraction,
    });

    let sent = 0;
    let removed = 0;
    const expiredIds: string[] = [];

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
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
  });

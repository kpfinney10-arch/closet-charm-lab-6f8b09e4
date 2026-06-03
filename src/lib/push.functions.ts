import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAnyRole } from "@/lib/roles.server";
import { sendPushToUserInternal } from "@/lib/push.server";

const Input = z.object({
  userId: z.string().uuid(),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
  url: z.string().min(1).max(500).optional(),
  tag: z.string().min(1).max(120).optional(),
  requireInteraction: z.boolean().optional(),
});

// Send a Web Push notification to every subscription a user has.
// Admins/dispatchers only. Expired subscriptions are cleaned up.
export const sendPushToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    await assertAnyRole(context.userId, ["admin", "dispatcher"]);
    const { userId, ...payload } = data;
    return sendPushToUserInternal(userId, payload);
  });

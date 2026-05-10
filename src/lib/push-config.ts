// VAPID public key — safe to expose to browsers (this is the public half).
// Used by the browser to subscribe to a push service. The matching private
// key lives only on the server as VAPID_PRIVATE_KEY.
export const VAPID_PUBLIC_KEY =
  "BBYPr16VnvR7y7qyadXXwFEQSrqwgopcqxjFRiBi7jlVMv4CGSbz5aasiJFEUMk1weNuKY30e4g3yE2akqMPwVg";

// Convert a base64url string into a Uint8Array — required by the
// PushManager.subscribe applicationServerKey option.
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

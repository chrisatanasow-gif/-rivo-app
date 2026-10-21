import webpush from "web-push";

export function ridePushSender(env = process.env) {
  const { RIVO_VAPID_PUBLIC_KEY: publicKey, RIVO_VAPID_PRIVATE_KEY: privateKey, RIVO_PUSH_ORIGIN: subject } = env;
  if (!publicKey || !privateKey || !subject) return null;
  return (subscription, payload) => webpush.sendNotification(subscription, JSON.stringify(payload), {
    vapidDetails: { publicKey, privateKey, subject },
    TTL: Math.max(1, Math.min(120, Math.floor((new Date(payload.expiresAt).getTime() - Date.now()) / 1000))),
    urgency: "high", topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0,32), timeout: 4000,
    ...(env.HTTPS_PROXY ? { proxy: env.HTTPS_PROXY } : {})
  });
}

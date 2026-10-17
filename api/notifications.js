import { neon } from "@neondatabase/serverless";
import webpush from "web-push";
import { createNotificationsHandler } from "../server/notifications-handler.js";

let handler;
export const config = { maxDuration: 300 };
export default async function notifications(req, res) {
  if (!handler) {
    const { DATABASE_URL, RIVO_VAPID_PUBLIC_KEY, RIVO_VAPID_PRIVATE_KEY, RIVO_PUSH_ORIGIN, CRON_SECRET } = process.env;
    const sql = DATABASE_URL ? neon(DATABASE_URL) : null;
    const configured = RIVO_VAPID_PUBLIC_KEY && RIVO_VAPID_PRIVATE_KEY && RIVO_PUSH_ORIGIN;
    handler = createNotificationsHandler({
      query: sql ? (statement, parameters) => sql.query(statement, parameters) : null,
      publicKey: RIVO_VAPID_PUBLIC_KEY,
      sendPush: configured ? (subscription, payload) => webpush.sendNotification(subscription, JSON.stringify(payload), {
        vapidDetails: { subject: RIVO_PUSH_ORIGIN, publicKey: RIVO_VAPID_PUBLIC_KEY, privateKey: RIVO_VAPID_PRIVATE_KEY },
        TTL: Math.max(1, Math.min(86400, Math.floor((new Date(payload.expiresAt).getTime() - Date.now()) / 1000))),
        urgency: "very-low", topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32), timeout: 6000,
        ...(process.env.HTTPS_PROXY ? { proxy: process.env.HTTPS_PROXY } : {})
      }) : null,
      cronSecret: CRON_SECRET, production: process.env.VERCEL_ENV === "production"
    });
  }
  return handler(req, res);
}

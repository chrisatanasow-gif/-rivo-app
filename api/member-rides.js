import { accountRuntime } from "../server/account-runtime.js";
import { waitUntil } from "@vercel/functions";
export default async (req, res) => {
  const runtime = accountRuntime();
  await runtime.rides(req, res);
  const action = new URL(req.url, "http://localhost").searchParams.get("action") || "state";
  if (res.statusCode < 300 && ["state","create","transition","presence"].includes(action)) waitUntil(runtime.alerts.dispatch());
};

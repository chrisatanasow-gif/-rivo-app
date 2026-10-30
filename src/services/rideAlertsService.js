import { pushSupport, subscribeBrowser } from "./notificationService.js";
export { pushSupport, subscribeBrowser };

export async function rideAlertsRequest(action, body, { endpoint, signal } = {}) {
  const role = location.pathname.startsWith("/account/drive") ? "driver" : "customer";
  let response;
  try {
    response = await fetch(`/api/member-rides?role=${role}&action=${encodeURIComponent(action)}${endpoint ? `&endpoint=${encodeURIComponent(endpoint)}` : ""}`, {
      method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: signal || AbortSignal.timeout(12000)
    });
  } catch { throw new Error("Няма връзка с RIVO. Опитай отново, когато имаш интернет."); }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || "Настройката не е потвърдена. Опитай отново.");
  return data;
}
export async function browserSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.getRegistration();
  return registration?.pushManager ? registration.pushManager.getSubscription() : null;
}

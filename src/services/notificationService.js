async function api(action, body, token) {
  const response = await fetch(`/api/notifications?action=${action}`, {
    method: body === undefined ? "GET" : "POST", cache: "no-store", credentials: "same-origin",
    headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || "Връзката за известия временно не е налична. Опитай отново.");
  return data;
}

export const notificationConfig = () => api("config");
export const notificationStatus = token => api("status", undefined, token);
export const savePushSubscription = (subscription, token) => api("subscribe", { subscription }, token);
export const removePushSubscription = token => api("unsubscribe", {}, token);
export const sendTestNotification = token => api("test", {}, token);

export function pushSupport() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (ios && !standalone) return "install";
  return window.isSecureContext && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window ? "supported" : "unsupported";
}

export async function subscribeBrowser(publicKey) {
  const registration = await Promise.race([navigator.serviceWorker.ready, new Promise((_, reject) => setTimeout(() => reject(new Error("Презареди RIVO и опитай отново.")), 10000))]);
  const raw = atob(publicKey.replace(/-/g, "+").replace(/_/g, "/"));
  const key = Uint8Array.from(raw, char => char.charCodeAt(0));
  return await registration.pushManager.getSubscription() || registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}

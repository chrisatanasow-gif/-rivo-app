export async function pilotRequest(action, body, { signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(abort, 12000);
  try {
    const member = window.location.pathname.startsWith("/account/");
    const role = window.location.pathname.startsWith("/account/drive") ? "driver" : "customer";
    const response = await fetch(`${member ? "/api/member-rides" : "/api/pilot"}?action=${encodeURIComponent(action)}${member ? `&role=${role}` : ""}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin", cache: "no-store",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal
    });
    let data;
    try { data = await response.json(); } catch { throw new Error("RIVO не отговаря. Опитай отново след малко."); }
    if (!response.ok) {
      const error = new Error(data.error || "Заявката не беше изпълнена.");
      error.status = response.status;
      error.code = data.code;
      throw error;
    }
    if (member && action === "logout") {
      const { signOut } = await import("./accountService.js");
      await signOut();
      window.location.assign("/account");
    }
    return data;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

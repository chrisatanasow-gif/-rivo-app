export async function pilotRequest(action, body, { signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = window.setTimeout(abort, 12000);
  try {
    const response = await fetch(`/api/pilot?action=${encodeURIComponent(action)}`, {
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
    return data;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

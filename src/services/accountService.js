let authModule;
const loadAuth = () => authModule ||= import("./accountAuth.js").catch(() => {
  authModule = null;
  const problem = new Error("Входът не успя да се зареди. Обнови страницата и опитай отново.");
  problem.code = "AUTH_LOAD_FAILED";
  throw problem;
});
function authProblem(error) {
  if (error?.code === "AUTH_LOAD_FAILED") return error;
  const status = error?.status;
  const message = status === 429 ? "Твърде много опити. Изчакай и опитай отново." : status >= 400 && status < 500 && error.message ? error.message : "Няма връзка с входа на RIVO. Опитай отново.";
  const problem = new Error(message);
  problem.status = status;
  return problem;
}
async function authCall(call) {
  let result;
  try { const { default: auth } = await loadAuth(); result = await call(auth); }
  catch (error) { throw authProblem(error); }
  if (result.error) throw authProblem(result.error);
}
export async function sendCode(email) {
  await authCall(auth => auth.emailOtp.sendVerificationOtp({ email, type: "sign-in" }));
}
export async function verifyCode(email, otp) {
  await authCall(auth => auth.signIn.emailOtp({ email, otp }));
}
export async function signOut() {
  await authCall(auth => auth.signOut());
  navigator.serviceWorker?.controller?.postMessage({ type: "clear-ride-notifications" });
}
export async function accountRequest(action = "profile", body, { signal } = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, 15000);
  try {
    let response;
    try {
      response = await fetch(`/api/account?action=${encodeURIComponent(action)}`, {
        method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error("Няма връзка с RIVO. Опитай отново, когато имаш интернет.");
    }
    let data;
    try { data = await response.json(); } catch { throw new Error("Не успяхме да прочетем отговора на RIVO. Опитай отново."); }
    if (!response.ok) { const error = new Error(data?.error || "Профилът не е достъпен. Опитай отново."); error.status = response.status; throw error; }
    return data;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

import { createAuthClient } from "@neondatabase/auth";

const auth = createAuthClient(`${window.location.origin}/api/auth`, { fetchOptions: { timeout: 15000, credentials: "same-origin" } });
function authError(error) {
  if (error) throw new Error(error.message || "Входът не е наличен. Опитай отново.");
}
export async function sendCode(email) {
  const result = await auth.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
  authError(result.error);
}
export async function verifyCode(email, otp) {
  const result = await auth.signIn.emailOtp({ email, otp });
  authError(result.error);
}
export async function signOut() {
  const result = await auth.signOut();
  authError(result.error);
}
export async function accountRequest(action = "profile", body) {
  const response = await fetch(`/api/account?action=${encodeURIComponent(action)}`, {
    method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || "Профилът не е достъпен."); error.status = response.status; throw error; }
  return data;
}

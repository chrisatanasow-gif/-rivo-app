import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/auth/vanilla/adapters";

export default createAuthClient(`${window.location.origin}/api/auth`, {
  adapter: BetterAuthVanillaAdapter({ fetchOptions: { timeout: 15000, credentials: "same-origin" } })
});

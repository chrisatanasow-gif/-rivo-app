// Starts the PGlite harness outside Playwright's Windows webServer process tree.
// With RIVO_E2E_BASE_URL it leaves an explicitly chosen remote test environment alone.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const cli = fileURLToPath(new URL("../node_modules/@playwright/test/cli.js", import.meta.url));
const serverFile = fileURLToPath(new URL("./pilot-test-server.mjs", import.meta.url));

function run(command, commandArgs, options) {
  const child = spawn(command, commandArgs, options);
  return once(child, "exit").then(([code, signal]) => ({ code, signal }));
}

async function runPlaywright(env) {
  return run(process.execPath, [cli, "test", ...args], { stdio: "inherit", env });
}

async function stop(server) {
  if (server.exitCode !== null || server.signalCode) return;
  server.kill("SIGTERM");
  const exited = await Promise.race([
    once(server, "exit"),
    new Promise(resolve => setTimeout(resolve, 5000))
  ]);
  if (!exited) server.kill("SIGKILL");
}

if (process.env.RIVO_E2E_BASE_URL) {
  const { code, signal } = await runPlaywright(process.env);
  process.exitCode = code ?? (signal ? 1 : 0);
} else {
  const server = spawn(process.execPath, [serverFile], { stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Локалният test server не стартира до 30 секунди.")), 30000);
      server.stdout.on("data", chunk => {
        if (!chunk.toString().includes("Local pilot test server:")) return;
        clearTimeout(timeout);
        resolve();
      });
      server.once("exit", () => reject(new Error("Локалният test server спря преди да е готов.")));
    });
    const { code, signal } = await runPlaywright({
      ...process.env,
      RIVO_E2E_BASE_URL: "http://127.0.0.1:4178",
      RIVO_PILOT_CODE: process.env.RIVO_PILOT_CODE || "rivo-local-test-invitation",
      RIVO_LOCAL_TEST_SERVER: "1"
    });
    process.exitCode = code ?? (signal ? 1 : 0);
  } finally {
    await stop(server);
  }
}

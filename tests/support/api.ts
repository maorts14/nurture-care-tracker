import { ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { testDatabaseUrl } from "./database.js";

export const apiUrl = "http://127.0.0.1:3002";

export class ApiClient {
  private cookie = "";

  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    if (this.cookie) headers.set("Cookie", this.cookie);
    const response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers,
      redirect: "manual",
    });
    const cookie = response.headers.get("set-cookie");
    if (cookie) this.cookie = cookie.split(";")[0];
    return response;
  }

  async signIn(email: string, password: string) {
    const response = await this.request("/api/auth/sign-in", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw new Error(`Could not sign in ${email}: ${response.status}`);
    return response;
  }
}

export async function startApi() {
  const output: string[] = [];
  const api = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: testDatabaseUrl(),
      NODE_ENV: "test",
      PORT: "3002",
      JWT_SECRET: "test-only-secret",
      WEB_ORIGIN: "http://127.0.0.1:5174",
      APP_URL: "http://127.0.0.1:5174",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  api.stdout?.on("data", (data) => output.push(data.toString()));
  api.stderr?.on("data", (data) => output.push(data.toString()));

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (api.exitCode !== null) throw new Error(`Test API exited early:\n${output.join("")}`);
    try {
      const response = await fetch(`${apiUrl}/api/health`);
      if (response.ok) return api;
    } catch {
      // The server has not bound its port yet.
    }
    await delay(100);
  }
  await stopApi(api);
  throw new Error(`Test API did not become healthy:\n${output.join("")}`);
}

export async function stopApi(api: ChildProcess) {
  if (api.exitCode !== null) return;
  api.kill("SIGTERM");
  await Promise.race([once(api, "exit"), delay(5_000)]);
  if (api.exitCode === null) api.kill("SIGKILL");
}

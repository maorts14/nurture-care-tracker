import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { ChildProcess } from "node:child_process";
import { ApiClient, startApi, stopApi } from "../support/api.js";
import { resetTestDatabase } from "../support/database.js";

let api: ChildProcess;

before(async () => {
  await resetTestDatabase();
  api = await startApi();
});
beforeEach(async () => resetTestDatabase());
after(async () => stopApi(api));

test("health, sign-in, registration, sign-out, and invalid auth responses follow their contracts", async () => {
  const visitor = new ApiClient();
  const health = await visitor.request("/api/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json() as { status: string }).status, "ok");

  const invalid = await visitor.request("/api/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ email: "alex@nurture.local", password: "wrong-password" }),
  });
  assert.equal(invalid.status, 401);
  assert.equal((await visitor.request("/api/me")).status, 401);

  const registered = await visitor.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: "new-account@test.local",
      password: "test-password",
      displayName: "New Account",
      locale: "en",
    }),
  });
  assert.equal(registered.status, 201);
  assert.equal((await registered.json() as { email: string }).email, "new-account@test.local");
  assert.equal((await visitor.request("/api/me")).status, 200);

  const duplicate = await visitor.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: "new-account@test.local",
      password: "test-password",
      displayName: "Duplicate",
      locale: "en",
    }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await visitor.request("/api/auth/sign-out", { method: "POST" })).status, 204);
  assert.equal((await visitor.request("/api/me")).status, 401);
});

test("unsupported locale and unconfigured Google login fail without external calls", async () => {
  const alex = new ApiClient();
  await alex.signIn("alex@nurture.local", "nurture-demo");
  const locale = await alex.request("/api/me/locale", {
    method: "PUT",
    body: JSON.stringify({ locale: "fr" }),
  });
  assert.equal(locale.status, 400);

  const google = await alex.request("/api/auth/google?returnTo=//unsafe.example");
  assert.equal(google.status, 503);
  assert.match((await google.json() as { error: string }).error, /GOOGLE_CLIENT_ID/);
});

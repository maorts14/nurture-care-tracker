import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { ChildProcess } from "node:child_process";
import { ApiClient, startApi, stopApi } from "../support/api.js";
import { resetTestDatabase } from "../support/database.js";

const leoId = "33333333-3333-3333-3333-333333333333";
let api: ChildProcess;

before(async () => {
  await resetTestDatabase();
  api = await startApi();
});
beforeEach(async () => resetTestDatabase());
after(async () => stopApi(api));

async function signedIn(email: string, password = "nurture-demo") {
  const client = new ApiClient();
  await client.signIn(email, password);
  return client;
}

test("members can update their locale and download only their own account export", async () => {
  const alex = await signedIn("alex@nurture.local");
  assert.equal(
    (await alex.request("/api/me/locale", {
      method: "PUT",
      body: JSON.stringify({ locale: "he" }),
    })).status,
    204,
  );
  const profile = (await (await alex.request("/api/me")).json()) as { locale: string; email: string };
  assert.equal(profile.locale, "he");

  const exported = await alex.request("/api/me/export");
  assert.equal(exported.status, 200);
  assert.match(exported.headers.get("content-disposition") ?? "", /feedme-account-data\.json/);
  const data = (await exported.json()) as {
    profile: { email: string; locale: string };
    memberships: Array<{ child_id: string }>;
    activity_logs_created_by_you: Array<unknown>;
  };
  assert.equal(data.profile.email, "alex@nurture.local");
  assert.equal(data.profile.locale, "he");
  assert.deepEqual(data.memberships.map((membership) => membership.child_id), [leoId]);
  assert.ok(data.activity_logs_created_by_you.length > 0);
});

test("owners and care managers can manage eligible members but never the owner", async () => {
  const alex = await signedIn("alex@nurture.local");
  const members = (await (await alex.request(`/api/children/${leoId}/members`)).json()) as Array<{
    id: string;
    role: string;
  }>;
  const owner = members.find((member) => member.role === "owner")!;
  const maya = members.find((member) => member.role === "caregiver")!;

  assert.equal(
    (await alex.request(`/api/children/${leoId}/members/${maya.id}`, {
      method: "PUT",
      body: JSON.stringify({ role: "viewer" }),
    })).status,
    204,
  );

  const sam = await signedIn("sam@nurture.local");
  assert.equal(
    (await sam.request(`/api/children/${leoId}/members/${owner.id}`, {
      method: "DELETE",
    })).status,
    403,
  );
  assert.equal(
    (await sam.request(`/api/children/${leoId}/members/${maya.id}`, { method: "DELETE" })).status,
    204,
  );
});

test("leaving transfers ownership when another caregiver exists, while an account deletion removes a solo child", async () => {
  const alex = await signedIn("alex@nurture.local");
  const preview = (await (await alex.request(`/api/children/${leoId}/leave-preview`)).json()) as {
    action: string;
  };
  assert.equal(preview.action, "transfer");
  assert.equal((await alex.request(`/api/children/${leoId}/leave`, { method: "POST" })).status, 204);
  const maya = await signedIn("maya@nurture.local");
  const afterTransfer = (await (await maya.request(`/api/children/${leoId}/members`)).json()) as Array<{
    email: string;
    role: string;
  }>;
  assert.equal(afterTransfer.find((member) => member.email === "maya@nurture.local")?.role, "owner");

  await resetTestDatabase({ seed: false });
  const solo = new ApiClient();
  const registration = await solo.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: "solo@test.local",
      password: "test-password",
      displayName: "Solo Parent",
      locale: "en",
    }),
  });
  assert.equal(registration.status, 201);
  const child = await solo.request("/api/children", {
    method: "POST",
    body: JSON.stringify({ name: "Solo baby", timezone: "Asia/Jerusalem" }),
  });
  assert.equal(child.status, 201);
  assert.equal(
    (await solo.request("/api/me", {
      method: "DELETE",
      body: JSON.stringify({ emailConfirmation: "wrong@test.local" }),
    })).status,
    400,
  );
  assert.equal(
    (await solo.request("/api/me", {
      method: "DELETE",
      body: JSON.stringify({ emailConfirmation: "solo@test.local" }),
    })).status,
    204,
  );
  assert.equal((await solo.request("/api/me")).status, 401);
});

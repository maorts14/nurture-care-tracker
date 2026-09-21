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

beforeEach(async () => {
  await resetTestDatabase();
});

after(async () => {
  await stopApi(api);
});

async function alex() {
  const client = new ApiClient();
  await client.signIn("alex@nurture.local", "nurture-demo");
  return client;
}

test("an invitation grants the invited account its selected care role", async () => {
  const owner = await alex();
  const inviteResponse = await owner.request(`/api/children/${leoId}/invitations`, {
    method: "POST",
    body: JSON.stringify({ email: "new-manager@test.local", role: "care_manager" }),
  });
  assert.equal(inviteResponse.status, 201);
  const invitation = (await inviteResponse.json()) as { token: string; acceptUrl: string };
  assert.match(invitation.acceptUrl, new RegExp(`invite=${invitation.token}`));

  const invited = new ApiClient();
  const registration = await invited.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: "new-manager@test.local",
      password: "test-password",
      displayName: "New Manager",
      locale: "en",
    }),
  });
  assert.equal(registration.status, 201);
  assert.equal((await invited.request(`/api/invitations/${invitation.token}`)).status, 200);
  assert.equal((await invited.request(`/api/invitations/${invitation.token}/accept`, { method: "POST" })).status, 204);

  const children = (await (await invited.request("/api/children")).json()) as Array<{
    id: string;
    role: string;
  }>;
  assert.equal(children.length, 1);
  assert.equal(children[0].id, leoId);
  assert.equal(children[0].role, "care_manager");
});

test("owners can create, rename, and delete a child profile", async () => {
  const owner = await alex();
  const created = await owner.request("/api/children", {
    method: "POST",
    body: JSON.stringify({ name: "Noa", timezone: "Asia/Jerusalem", birthDate: "2026-01-01" }),
  });
  assert.equal(created.status, 201);
  const { id } = (await created.json()) as { id: string };

  const renamed = await owner.request(`/api/children/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name: "Noa Rose" }),
  });
  assert.equal(renamed.status, 204);
  const children = (await (await owner.request("/api/children")).json()) as Array<{ id: string; name: string }>;
  assert.equal(children.find((child) => child.id === id)?.name, "Noa Rose");

  assert.equal((await owner.request(`/api/children/${id}`, { method: "DELETE" })).status, 204);
  const afterDeletion = (await (await owner.request("/api/children")).json()) as Array<{ id: string }>;
  assert.equal(afterDeletion.some((child) => child.id === id), false);
});

test("custom activities and their fields are managed by owners or care managers", async () => {
  const owner = await alex();
  const created = await owner.request(`/api/children/${leoId}/activities`, {
    method: "POST",
    body: JSON.stringify({
      name: "Medicine",
      color: "#1d9d83",
      fields: [{ key: "dose", label: "Dose", type: "number", unit: "ml", metrics: ["sum"] }],
    }),
  });
  assert.equal(created.status, 201);
  const { id: activityId } = (await created.json()) as { id: string };

  const extraField = await owner.request(`/api/activities/${activityId}/fields`, {
    method: "POST",
    body: JSON.stringify({ fieldKey: "note", label: "Instruction", fieldType: "text" }),
  });
  assert.equal(extraField.status, 201);
  assert.equal(
    (await owner.request(`/api/activities/${activityId}`, {
      method: "PUT",
      body: JSON.stringify({ name: "Medication", color: "#198f7a" }),
    })).status,
    204,
  );

  const dashboard = (await (await owner.request(`/api/children/${leoId}/dashboard`)).json()) as {
    activities: Array<{ id: string; name: string; fields: Array<{ field_key: string }> }>;
  };
  assert.deepEqual(dashboard.activities.find((activity) => activity.id === activityId), {
    id: activityId,
    name: "Medication",
    kind: "custom",
    color: "#198f7a",
    fields: dashboard.activities.find((activity) => activity.id === activityId)!.fields,
  });
  assert.deepEqual(
    dashboard.activities
      .find((activity) => activity.id === activityId)
      ?.fields.map((field) => field.field_key)
      .sort(),
    ["dose", "note"],
  );
  assert.equal((await owner.request(`/api/activities/${activityId}`, { method: "DELETE" })).status, 204);
});

test("reminders, notes, and exports keep their intended access and data shape", async () => {
  const owner = await alex();
  const dashboard = (await (await owner.request(`/api/children/${leoId}/dashboard`)).json()) as {
    activities: Array<{ id: string; kind: string }>;
  };
  const feedingId = dashboard.activities.find((activity) => activity.kind === "feeding")!.id;
  const reminderResponse = await owner.request(`/api/children/${leoId}/reminders`, {
    method: "POST",
    body: JSON.stringify({ title: "Vitamin", activityId: feedingId, kind: "interval", intervalMinutes: 480 }),
  });
  assert.equal(reminderResponse.status, 201);
  const reminder = (await reminderResponse.json()) as { id: string };
  assert.equal(
    (await owner.request(`/api/reminders/${reminder.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: "Vitamin at noon",
        activityId: feedingId,
        kind: "one_time",
        scheduledFor: "2026-09-22T09:00:00.000Z",
      }),
    })).status,
    204,
  );
  assert.equal((await owner.request(`/api/reminders/${reminder.id}/complete`, { method: "POST" })).status, 204);

  const maya = new ApiClient();
  await maya.signIn("maya@nurture.local", "nurture-demo");
  const noteResponse = await maya.request(`/api/children/${leoId}/notes`, {
    method: "POST",
    body: JSON.stringify({ body: "Private handoff", visibility: "private" }),
  });
  assert.equal(noteResponse.status, 201);
  const note = (await noteResponse.json()) as { id: string };
  const ownerNotes = (await (await owner.request(`/api/children/${leoId}/notes`)).json()) as Array<{ id: string }>;
  assert.equal(ownerNotes.some((item) => item.id === note.id), false);
  assert.equal(
    (await maya.request(`/api/notes/${note.id}`, {
      method: "PUT",
      body: JSON.stringify({ body: "Updated private handoff", visibility: "private" }),
    })).status,
    204,
  );
  assert.equal((await maya.request(`/api/notes/${note.id}`, { method: "DELETE" })).status, 204);

  const csv = await owner.request(`/api/children/${leoId}/export.csv`);
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(await csv.text(), /record_type,activity,event_time/);

  const report = await owner.request(
    `/api/children/${leoId}/export.report?activities=${feedingId}&period=calendar_day&history=true&historyStart=2026-09-01&historyEnd=2026-09-30&locale=en`,
  );
  assert.equal(report.status, 200);
  assert.match(report.headers.get("content-type") ?? "", /text\/html/);
  assert.match(await report.text(), /Care patterns/);
});

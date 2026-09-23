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
      icon: "stethoscope",
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
      body: JSON.stringify({ name: "Medication", color: "#198f7a", icon: "pill" }),
    })).status,
    204,
  );

  const dashboard = (await (await owner.request(`/api/children/${leoId}/dashboard`)).json()) as {
    activities: Array<{
      id: string;
      name: string;
      fields: Array<{
        id: string;
        field_key: string;
        label: string;
        field_type: string;
        unit: string | null;
        options: string[];
        boolean_true_label: string | null;
        boolean_false_label: string | null;
      }>;
    }>;
  };
  assert.deepEqual(dashboard.activities.find((activity) => activity.id === activityId), {
    id: activityId,
    name: "Medication",
    kind: "custom",
    color: "#198f7a",
    icon: "pill",
    fields: dashboard.activities.find((activity) => activity.id === activityId)!.fields,
    schedule: null,
  });
  assert.deepEqual(
    dashboard.activities
      .find((activity) => activity.id === activityId)
      ?.fields.map((field) => field.field_key)
      .sort(),
    ["dose", "note"],
  );
  const medication = dashboard.activities.find((activity) => activity.id === activityId)!;
  assert.equal(
    (await owner.request(`/api/children/${leoId}/logs`, {
      method: "POST",
      body: JSON.stringify({
        activityId,
        eventTime: "2026-09-22T09:00:00.000Z",
        eventTimezone: "Asia/Jerusalem",
        fieldValues: { dose: 2.5, note: "After breakfast" },
      }),
    })).status,
    201,
  );
  const savedFields = await owner.request(`/api/activities/${activityId}/fields`, {
    method: "PUT",
    body: JSON.stringify({
      fields: [
        {
          id: medication.fields.find((field) => field.field_key === "dose")!.id,
          key: "dose",
          label: "Dose",
          type: "number",
          unit: "ml",
          options: ["not applicable"],
          metrics: ["average"],
        },
        {
          id: medication.fields.find((field) => field.field_key === "note")!.id,
          key: "note",
          label: "How given",
          type: "select",
          unit: "ml",
          options: ["Drops", "Tablet"],
          metrics: [],
        },
        {
          key: "taken",
          label: "Taken",
          type: "boolean",
          options: ["not applicable"],
          booleanTrueLabel: "Taken",
          booleanFalseLabel: "Skipped",
          metrics: [],
        },
      ],
    }),
  });
  assert.equal(savedFields.status, 204);
  const afterFieldEdit = (await (await owner.request(`/api/children/${leoId}/dashboard`)).json()) as {
    timeline: Array<{ activity_id: string; field_values: Record<string, unknown> }>;
    activities: typeof dashboard.activities;
  };
  const editedFields = afterFieldEdit.activities.find((activity) => activity.id === activityId)!.fields;
  assert.deepEqual(
    editedFields.map((field) => ({
      key: field.field_key,
      label: field.label,
      type: field.field_type,
      unit: field.unit,
      options: field.options,
      yes: field.boolean_true_label,
      no: field.boolean_false_label,
    })).sort((left, right) => left.key.localeCompare(right.key)),
    [
      { key: "dose", label: "Dose", type: "number", unit: "ml", options: [], yes: null, no: null },
      { key: "note", label: "How given", type: "select", unit: null, options: ["Drops", "Tablet"], yes: null, no: null },
      { key: "taken", label: "Taken", type: "boolean", unit: null, options: [], yes: "Taken", no: "Skipped" },
    ],
  );
  assert.deepEqual(
    afterFieldEdit.timeline.find((log) => log.activity_id === activityId)!.field_values,
    { dose: 2.5, note: "After breakfast" },
  );
  assert.equal(
    (await owner.request(`/api/activities/${activityId}/fields`, {
      method: "PUT",
      body: JSON.stringify({ fields: [] }),
    })).status,
    204,
  );
  const afterRemoval = (await (await owner.request(`/api/children/${leoId}/dashboard`)).json()) as {
    timeline: Array<{ activity_id: string; field_values: Record<string, unknown> }>;
    activities: typeof dashboard.activities;
  };
  assert.deepEqual(afterRemoval.activities.find((activity) => activity.id === activityId)!.fields, []);
  assert.deepEqual(
    afterRemoval.timeline.find((log) => log.activity_id === activityId)!.field_values,
    { dose: 2.5, note: "After breakfast" },
  );
  assert.equal((await owner.request(`/api/activities/${activityId}`, { method: "DELETE" })).status, 204);
});

test("caregivers can log care but cannot administer activities or reminders", async () => {
  const owner = await alex();
  const dashboard = (await (await owner.request(`/api/children/${leoId}/dashboard`)).json()) as {
    activities: Array<{ id: string; kind: string }>;
  };
  const feedingId = dashboard.activities.find((activity) => activity.kind === "feeding")!.id;
  const caregiver = new ApiClient();
  await caregiver.signIn("maya@nurture.local", "nurture-demo");

  assert.equal(
    (await caregiver.request(`/api/children/${leoId}/activities`, {
      method: "POST",
      body: JSON.stringify({ name: "Medicine", color: "#1d9d83", fields: [] }),
    })).status,
    403,
  );
  assert.equal(
    (await caregiver.request(`/api/activities/${feedingId}/schedule`, {
      method: "PUT",
      body: JSON.stringify({ kind: "interval", intervalMinutes: 180 }),
    })).status,
    403,
  );
  assert.equal(
    (await caregiver.request(`/api/children/${leoId}/logs`, {
      method: "POST",
      body: JSON.stringify({
        activityId: feedingId,
        eventTime: "2026-09-22T09:00:00.000Z",
        eventTimezone: "Asia/Jerusalem",
        fieldValues: {},
        portions: [{ kind: "formula", deliveryMethod: "bottle", amountMl: 90 }],
      }),
    })).status,
    201,
  );
});

test("activity schedules, notes, and exports keep their intended access and data shape", async () => {
  const owner = await alex();
  const initialDashboard = (await (await owner.request(`/api/children/${leoId}/dashboard`)).json()) as {
    activities: Array<{ id: string; kind: string }>;
  };
  const feedingId = initialDashboard.activities.find((activity) => activity.kind === "feeding")!.id;
  const createdActivity = await owner.request(`/api/children/${leoId}/activities`, {
    method: "POST",
    body: JSON.stringify({ name: "Vitamin", color: "#198f7a", fields: [] }),
  });
  assert.equal(createdActivity.status, 201);
  const vitamin = (await createdActivity.json()) as { id: string };
  assert.equal(
    (await owner.request(`/api/activities/${vitamin.id}/schedule`, {
      method: "PUT",
      body: JSON.stringify({ kind: "interval", intervalMinutes: 480 }),
    })).status,
    201,
  );
  const beforeFirstVitaminRecord = (await (await owner.request(`/api/children/${leoId}/dashboard`)).json()) as {
    activities: Array<{
      id: string;
      schedule: { kind: string; interval_minutes: number; last_event_time: string | null } | null;
    }>;
  };
  assert.deepEqual(beforeFirstVitaminRecord.activities.find((activity) => activity.id === vitamin.id)?.schedule, {
    activity_id: vitamin.id,
    kind: "interval",
    interval_minutes: 480,
    scheduled_for: null,
    last_event_time: null,
  });
  assert.equal(
    (await owner.request(`/api/activities/${vitamin.id}/schedule`, {
      method: "PUT",
      body: JSON.stringify({
        kind: "one_time",
        scheduledFor: "2026-09-22T09:00:00.000Z",
      }),
    })).status,
    201,
  );
  assert.equal(
    (await owner.request(`/api/children/${leoId}/logs`, {
      method: "POST",
      body: JSON.stringify({
        activityId: vitamin.id,
        eventTime: "2026-09-22T09:05:00.000Z",
        eventTimezone: "Asia/Jerusalem",
        fieldValues: {},
        completeOneTimeSchedule: true,
      }),
    })).status,
    201,
  );
  const completedDashboard = (await (await owner.request(`/api/children/${leoId}/dashboard`)).json()) as {
    timeline: Array<{ activity_id: string }>;
    activities: Array<{ id: string; schedule: unknown }>;
  };
  assert.equal(completedDashboard.timeline.some((log) => log.activity_id === vitamin.id), true);
  assert.equal(completedDashboard.activities.find((activity) => activity.id === vitamin.id)?.schedule, null);

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

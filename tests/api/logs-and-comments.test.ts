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

async function activityIds(client: ApiClient) {
  const response = await client.request(`/api/children/${leoId}/dashboard`);
  const dashboard = (await response.json()) as {
    activities: Array<{ id: string; kind: "feeding" | "diaper" | "custom" }>;
  };
  return {
    feeding: dashboard.activities.find((activity) => activity.kind === "feeding")!.id,
    diaper: dashboard.activities.find((activity) => activity.kind === "diaper")!.id,
  };
}

async function createFeeding(client: ApiClient, activityId: string, eventTime = "2026-09-20T12:00:00.000Z") {
  const response = await client.request(`/api/children/${leoId}/logs`, {
    method: "POST",
    body: JSON.stringify({
      activityId,
      eventTime,
      eventTimezone: "Asia/Jerusalem",
      fieldValues: {},
      note: "Settled quickly",
      portions: [
        { kind: "breast_milk", deliveryMethod: "bottle", amountMl: 60 },
        { kind: "formula", deliveryMethod: "bottle", amountMl: 40 },
      ],
    }),
  });
  assert.equal(response.status, 201);
  return (await response.json()) as { id: string };
}

test("feeding logs preserve multiple portions and owners or care managers can edit another caregiver's record", async () => {
  const alex = new ApiClient();
  await alex.signIn("alex@nurture.local", "nurture-demo");
  const { feeding } = await activityIds(alex);
  const log = await createFeeding(alex, feeding);

  const maya = new ApiClient();
  await maya.signIn("maya@nurture.local", "nurture-demo");
  const caregiverEdit = await maya.request(`/api/logs/${log.id}`, {
    method: "PUT",
    body: JSON.stringify({
      activityId: feeding,
      eventTime: "2026-09-20T13:00:00.000Z",
      eventTimezone: "Asia/Jerusalem",
      fieldValues: {},
      portions: [{ kind: "formula", deliveryMethod: "bottle", amountMl: 100 }],
    }),
  });
  assert.equal(caregiverEdit.status, 403);

  const sam = new ApiClient();
  await sam.signIn("sam@nurture.local", "nurture-demo");
  const managerEdit = await sam.request(`/api/logs/${log.id}`, {
    method: "PUT",
    body: JSON.stringify({
      activityId: feeding,
      eventTime: "2026-09-20T13:00:00.000Z",
      eventTimezone: "Asia/Jerusalem",
      fieldValues: {},
      note: "Updated by care manager",
      portions: [
        { kind: "breast_milk", deliveryMethod: "bottle", amountMl: 70 },
        { kind: "formula", deliveryMethod: "bottle", amountMl: 50 },
      ],
    }),
  });
  assert.equal(managerEdit.status, 204);

  const dashboardResponse = await alex.request(`/api/children/${leoId}/dashboard`);
  const dashboard = (await dashboardResponse.json()) as {
    timeline: Array<{
      id: string;
      note: string;
      feeding_portions: Array<{ amount_ml: number; kind: string }>;
    }>;
  };
  const updatedLog = dashboard.timeline.find((event) => event.id === log.id);
  assert.deepEqual(updatedLog?.feeding_portions, [
    { kind: "breast_milk", delivery_method: "bottle", amount_ml: 70 },
    { kind: "formula", delivery_method: "bottle", amount_ml: 50 },
  ]);
  assert.equal(updatedLog?.note, "Updated by care manager");

  const deleted = await sam.request(`/api/logs/${log.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);
});

test("comments are visible to members but only their creator can edit or delete them", async () => {
  const alex = new ApiClient();
  await alex.signIn("alex@nurture.local", "nurture-demo");
  const { feeding } = await activityIds(alex);
  const log = await createFeeding(alex, feeding);

  const maya = new ApiClient();
  await maya.signIn("maya@nurture.local", "nurture-demo");
  const created = await maya.request(`/api/logs/${log.id}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: "He was comfortable." }),
  });
  assert.equal(created.status, 201);
  const comment = (await created.json()) as { id: string };

  const visibleToAlex = await alex.request(`/api/logs/${log.id}/comments`);
  const comments = (await visibleToAlex.json()) as Array<{
    id: string;
    body: string;
    created_by_name: string;
  }>;
  assert.equal(comments.length, 1);
  assert.deepEqual(comments[0], {
    ...comments[0],
    id: comment.id,
    body: "He was comfortable.",
    created_by_name: "Maya Cohen",
  });

  const deniedEdit = await alex.request(`/api/comments/${comment.id}`, {
    method: "PUT",
    body: JSON.stringify({ body: "Changed by someone else" }),
  });
  assert.equal(deniedEdit.status, 403);

  const updated = await maya.request(`/api/comments/${comment.id}`, {
    method: "PUT",
    body: JSON.stringify({ body: "Slept comfortably." }),
  });
  assert.equal(updated.status, 204);
  const deleted = await maya.request(`/api/comments/${comment.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);
});

test("declared pauses remove affected feeding intervals from interval analytics", async () => {
  const alex = new ApiClient();
  await alex.signIn("alex@nurture.local", "nurture-demo");
  const { feeding } = await activityIds(alex);
  await createFeeding(alex, feeding, "2026-09-18T08:00:00.000Z");
  await createFeeding(alex, feeding, "2026-09-18T12:00:00.000Z");
  await createFeeding(alex, feeding, "2026-09-18T16:00:00.000Z");

  const pause = await alex.request(`/api/children/${leoId}/gaps`, {
    method: "POST",
    body: JSON.stringify({
      startsAt: "2026-09-18T11:00:00.000Z",
      endsAt: "2026-09-18T13:00:00.000Z",
    }),
  });
  assert.equal(pause.status, 201);

  const analytics = await alex.request(`/api/children/${leoId}/insights/${feeding}`);
  const { intervals } = (await analytics.json()) as { intervals: number[] };
  assert.equal(intervals.includes(4 * 60 * 60 * 1000), false);
});

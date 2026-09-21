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

test("care pauses are created, edited, exposed on the dashboard, and deleted", async () => {
  const alex = new ApiClient();
  await alex.signIn("alex@nurture.local", "nurture-demo");

  const created = await alex.request(`/api/children/${leoId}/gaps`, {
    method: "POST",
    body: JSON.stringify({
      startsAt: "2026-09-18T16:00:00.000Z",
      endsAt: "2026-09-19T19:00:00.000Z",
      reason: "Shabbat",
    }),
  });
  assert.equal(created.status, 201);
  const pause = (await created.json()) as { id: string; include_in_averages: boolean };
  assert.equal(pause.include_in_averages, false, "new pauses exclude affected days by default");

  const firstDashboard = await alex.request(`/api/children/${leoId}/dashboard`);
  const firstData = (await firstDashboard.json()) as {
    gaps: Array<{ id: string; reason: string; include_in_averages: boolean; created_by: string }>;
  };
  assert.equal(firstData.gaps.length, 1);
  assert.equal(firstData.gaps[0].id, pause.id);
  assert.equal(firstData.gaps[0].reason, "Shabbat");
  assert.equal(firstData.gaps[0].include_in_averages, false);
  assert.equal(firstData.gaps[0].created_by, "Alex Morgan");

  const updated = await alex.request(`/api/children/${leoId}/gaps/${pause.id}`, {
    method: "PUT",
    body: JSON.stringify({
      startsAt: "2026-09-18T17:00:00.000Z",
      endsAt: "2026-09-19T18:00:00.000Z",
      reason: "Travel",
      includeInAverages: true,
    }),
  });
  assert.equal(updated.status, 204);

  const secondDashboard = await alex.request(`/api/children/${leoId}/dashboard`);
  const secondData = (await secondDashboard.json()) as {
    gaps: Array<{ id: string; reason: string; include_in_averages: boolean }>;
  };
  assert.equal(secondData.gaps.length, 1);
  assert.equal(secondData.gaps[0].id, pause.id);
  assert.equal(secondData.gaps[0].reason, "Travel");
  assert.equal(secondData.gaps[0].include_in_averages, true);

  const deleted = await alex.request(`/api/children/${leoId}/gaps/${pause.id}`, {
    method: "DELETE",
  });
  assert.equal(deleted.status, 204);

  const finalDashboard = await alex.request(`/api/children/${leoId}/dashboard`);
  assert.deepEqual((await finalDashboard.json() as { gaps: unknown[] }).gaps, []);
});

test("care pause preference excludes every touched local day from averages but not when explicitly included", async () => {
  await resetTestDatabase({ seed: false });
  const caregiver = new ApiClient();
  const registration = await caregiver.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: "averages@test.local",
      password: "test-password",
      displayName: "Average Tester",
      locale: "en",
    }),
  });
  assert.equal(registration.status, 201);

  const childResponse = await caregiver.request("/api/children", {
    method: "POST",
    body: JSON.stringify({ name: "Avi", timezone: "Asia/Jerusalem" }),
  });
  assert.equal(childResponse.status, 201);
  const { id: childId } = (await childResponse.json()) as { id: string };

  const initialDashboard = await caregiver.request(`/api/children/${childId}/dashboard`);
  const initialData = (await initialDashboard.json()) as {
    activities: Array<{ id: string; kind: string }>;
  };
  const feedingId = initialData.activities.find((activity) => activity.kind === "feeding")?.id;
  assert.ok(feedingId);

  for (const eventTime of [
    "2026-09-10T07:00:00.000Z",
    "2026-09-11T07:00:00.000Z",
    "2026-09-11T11:00:00.000Z",
    "2026-09-11T15:00:00.000Z",
  ]) {
    const response = await caregiver.request(`/api/children/${childId}/logs`, {
      method: "POST",
      body: JSON.stringify({
        activityId: feedingId,
        eventTime,
        eventTimezone: "Asia/Jerusalem",
        fieldValues: {},
        portions: [{ kind: "breast_milk", deliveryMethod: "bottle", amountMl: 100 }],
      }),
    });
    assert.equal(response.status, 201);
  }

  const pauseResponse = await caregiver.request(`/api/children/${childId}/gaps`, {
    method: "POST",
    body: JSON.stringify({
      startsAt: "2026-09-11T00:00:00.000Z",
      endsAt: "2026-09-11T23:00:00.000Z",
      reason: "Paused day",
    }),
  });
  const pause = (await pauseResponse.json()) as { id: string };

  const excludedDashboard = await caregiver.request(`/api/children/${childId}/dashboard`);
  const excludedData = (await excludedDashboard.json()) as {
    analytics: Array<{
      activity_id: string;
      average: { count: number };
      history: Array<{ date: string; excluded_from_average: boolean }>;
    }>;
  };
  const excludedFeeding = excludedData.analytics.find((activity) => activity.activity_id === feedingId);
  assert.equal(excludedFeeding?.average.count, 1);
  assert.deepEqual(excludedFeeding?.history, [
    { date: "2026-09-11", count: 3, portion_count: 3, total_amount_ml: 300, average_amount_ml: 100, excluded_from_average: true },
    { date: "2026-09-10", count: 1, portion_count: 1, total_amount_ml: 100, average_amount_ml: 100, excluded_from_average: false },
  ]);

  const included = await caregiver.request(`/api/children/${childId}/gaps/${pause.id}`, {
    method: "PUT",
    body: JSON.stringify({
      startsAt: "2026-09-11T00:00:00.000Z",
      endsAt: "2026-09-11T23:00:00.000Z",
      reason: "Paused day",
      includeInAverages: true,
    }),
  });
  assert.equal(included.status, 204);

  const includedDashboard = await caregiver.request(`/api/children/${childId}/dashboard`);
  const includedData = (await includedDashboard.json()) as {
    analytics: Array<{ activity_id: string; average: { count: number } }>;
  };
  assert.equal(
    includedData.analytics.find((activity) => activity.activity_id === feedingId)?.average.count,
    2,
  );
});

test("viewers cannot manage care pauses", async () => {
  const alex = new ApiClient();
  await alex.signIn("alex@nurture.local", "nurture-demo");
  const invitationResponse = await alex.request(`/api/children/${leoId}/invitations`, {
    method: "POST",
    body: JSON.stringify({ email: "viewer@test.local", role: "viewer" }),
  });
  const { token } = (await invitationResponse.json()) as { token: string };

  const viewer = new ApiClient();
  const registration = await viewer.request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      email: "viewer@test.local",
      password: "test-password",
      displayName: "View Only",
      locale: "en",
    }),
  });
  assert.equal(registration.status, 201);
  assert.equal((await viewer.request(`/api/invitations/${token}/accept`, { method: "POST" })).status, 204);

  const response = await viewer.request(`/api/children/${leoId}/gaps`, {
    method: "POST",
    body: JSON.stringify({
      startsAt: "2026-09-18T16:00:00.000Z",
      endsAt: "2026-09-18T19:00:00.000Z",
    }),
  });
  assert.equal(response.status, 403);
});

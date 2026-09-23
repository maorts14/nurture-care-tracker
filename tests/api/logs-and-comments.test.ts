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

type FeedingPortion = {
  kind: "breast_milk" | "formula";
  deliveryMethod: "bottle" | "breastfeeding";
  amountMl?: number;
  durationMinutes?: number;
};

async function createChildWithFeeding(client: ApiClient, name: string) {
  const childResponse = await client.request("/api/children", {
    method: "POST",
    body: JSON.stringify({ name, timezone: "Asia/Jerusalem" }),
  });
  assert.equal(childResponse.status, 201);
  const child = (await childResponse.json()) as { id: string };
  const dashboardResponse = await client.request(`/api/children/${child.id}/dashboard`);
  const dashboard = (await dashboardResponse.json()) as {
    activities: Array<{ id: string; kind: "feeding" | "diaper" | "custom" }>;
  };
  return {
    childId: child.id,
    feedingId: dashboard.activities.find((activity) => activity.kind === "feeding")!.id,
  };
}

function logFeeding(
  client: ApiClient,
  childId: string,
  activityId: string,
  eventTime: string,
  portions: FeedingPortion[],
) {
  return client.request(`/api/children/${childId}/logs`, {
    method: "POST",
    body: JSON.stringify({
      activityId,
      eventTime,
      eventTimezone: "Asia/Jerusalem",
      fieldValues: {},
      portions,
    }),
  });
}

async function createFeeding(client: ApiClient, activityId: string, eventTime = "2026-09-20T12:00:00.000Z") {
  const response = await logFeeding(client, leoId, activityId, eventTime, [
    { kind: "breast_milk", deliveryMethod: "bottle", amountMl: 60 },
    { kind: "formula", deliveryMethod: "bottle", amountMl: 40 },
  ]);
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
        { kind: "breast_milk", deliveryMethod: "breastfeeding", durationMinutes: 18 },
      ],
    }),
  });
  assert.equal(managerEdit.status, 204);

  const dashboardResponse = await alex.request(`/api/children/${leoId}/dashboard`);
  const dashboard = (await dashboardResponse.json()) as {
    timeline: Array<{
      id: string;
      note: string;
      feeding_portions: Array<{ amount_ml: number | null; duration_minutes: number | null; kind: string }>;
    }>;
  };
  const updatedLog = dashboard.timeline.find((event) => event.id === log.id);
  assert.deepEqual(updatedLog?.feeding_portions, [
    { kind: "breast_milk", delivery_method: "bottle", amount_ml: 70, duration_minutes: null },
    { kind: "breast_milk", delivery_method: "breastfeeding", amount_ml: null, duration_minutes: 18 },
  ]);
  assert.equal(updatedLog?.note, "Updated by care manager");

  const deleted = await sam.request(`/api/logs/${log.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 204);
});

test("feeding logs store bottle-only, breast-only, and mixed measurements without inventing the other unit", async () => {
  const alex = new ApiClient();
  await alex.signIn("alex@nurture.local", "nurture-demo");
  const { childId, feedingId } = await createChildWithFeeding(alex, "Measurement shapes");

  const breastOnly = await logFeeding(
    alex,
    childId,
    feedingId,
    "2026-09-20T06:00:00.000Z",
    [{ kind: "breast_milk", deliveryMethod: "breastfeeding", durationMinutes: 22 }],
  );
  const bottleOnly = await logFeeding(
    alex,
    childId,
    feedingId,
    "2026-09-20T10:00:00.000Z",
    [{ kind: "formula", deliveryMethod: "bottle", amountMl: 90 }],
  );
  const mixed = await logFeeding(
    alex,
    childId,
    feedingId,
    "2026-09-20T14:00:00.000Z",
    [
      { kind: "breast_milk", deliveryMethod: "breastfeeding", durationMinutes: 14 },
      { kind: "breast_milk", deliveryMethod: "bottle", amountMl: 60 },
    ],
  );
  assert.equal(breastOnly.status, 201);
  assert.equal(bottleOnly.status, 201);
  assert.equal(mixed.status, 201);

  const dashboardResponse = await alex.request(`/api/children/${childId}/dashboard`);
  const dashboard = (await dashboardResponse.json()) as {
    timeline: Array<{
      id: string;
      feeding_portions: Array<{
        kind: string;
        delivery_method: string;
        amount_ml: number | null;
        duration_minutes: number | null;
      }>;
    }>;
  };
  const ids = [
    (await breastOnly.json() as { id: string }).id,
    (await bottleOnly.json() as { id: string }).id,
    (await mixed.json() as { id: string }).id,
  ];
  const portionsByLog = dashboard.timeline
    .filter((log) => ids.includes(log.id))
    .map((log) => log.feeding_portions);
  assert.deepEqual(
    portionsByLog.find((portions) => portions.length === 1 && portions[0].delivery_method === "breastfeeding"),
    [{ kind: "breast_milk", delivery_method: "breastfeeding", amount_ml: null, duration_minutes: 22 }],
  );
  assert.deepEqual(
    portionsByLog.find((portions) => portions.length === 1 && portions[0].delivery_method === "bottle"),
    [{ kind: "formula", delivery_method: "bottle", amount_ml: 90, duration_minutes: null }],
  );
  assert.deepEqual(
    portionsByLog.find((portions) => portions.length === 2),
    [
      { kind: "breast_milk", delivery_method: "breastfeeding", amount_ml: null, duration_minutes: 14 },
      { kind: "breast_milk", delivery_method: "bottle", amount_ml: 60, duration_minutes: null },
    ],
  );

  const csv = await alex.request(`/api/children/${childId}/export.csv`);
  assert.equal(csv.status, 200);
  assert.match(await csv.text(), /Breast milk · Breastfeeding: (22|14) min/);
});

test("feeding measurement validation rejects missing, zero, and incompatible values without creating logs", async () => {
  const alex = new ApiClient();
  await alex.signIn("alex@nurture.local", "nurture-demo");
  const { childId, feedingId } = await createChildWithFeeding(alex, "Measurement validation");
  const invalidPortionSets: FeedingPortion[][] = [
    [],
    [{ kind: "breast_milk", deliveryMethod: "breastfeeding" }],
    [{ kind: "breast_milk", deliveryMethod: "breastfeeding", durationMinutes: 0 }],
    [{ kind: "formula", deliveryMethod: "breastfeeding", durationMinutes: 12 }],
    [{ kind: "formula", deliveryMethod: "bottle" }],
    [{ kind: "formula", deliveryMethod: "bottle", amountMl: 0 }],
  ];

  for (const portions of invalidPortionSets) {
    const response = await logFeeding(
      alex,
      childId,
      feedingId,
      "2026-09-20T12:00:00.000Z",
      portions,
    );
    assert.equal(response.status, 400);
  }

  const dashboardResponse = await alex.request(`/api/children/${childId}/dashboard`);
  const dashboard = (await dashboardResponse.json()) as { timeline: Array<{ activity_id: string }> };
  assert.equal(dashboard.timeline.some((log) => log.activity_id === feedingId), false);
});

test("feeding analytics use the appropriate denominator for bottle and breastfeeding averages", async () => {
  const alex = new ApiClient();
  await alex.signIn("alex@nurture.local", "nurture-demo");
  const { childId, feedingId } = await createChildWithFeeding(alex, "Measurement analytics");

  const records: Array<[string, FeedingPortion[]]> = [
    ["2026-09-20T06:00:00.000Z", [{ kind: "breast_milk", deliveryMethod: "breastfeeding", durationMinutes: 20 }]],
    ["2026-09-20T10:00:00.000Z", [{ kind: "formula", deliveryMethod: "bottle", amountMl: 100 }]],
    [
      "2026-09-20T14:00:00.000Z",
      [
        { kind: "breast_milk", deliveryMethod: "breastfeeding", durationMinutes: 10 },
        { kind: "breast_milk", deliveryMethod: "bottle", amountMl: 50 },
      ],
    ],
    ["2026-09-19T09:00:00.000Z", [{ kind: "breast_milk", deliveryMethod: "breastfeeding", durationMinutes: 30 }]],
    ["2026-09-18T09:00:00.000Z", [{ kind: "formula", deliveryMethod: "bottle", amountMl: 80 }]],
  ];
  for (const [eventTime, portions] of records) {
    const response = await logFeeding(alex, childId, feedingId, eventTime, portions);
    assert.equal(response.status, 201);
  }

  const dashboardResponse = await alex.request(`/api/children/${childId}/dashboard`);
  const dashboard = (await dashboardResponse.json()) as {
    analytics: Array<{
      activity_id: string;
      average: {
        bottle_portion_count: number;
        breastfeeding_portion_count: number;
        total_amount_ml: number;
        total_breastfeeding_minutes: number;
        average_amount_ml: number | null;
        average_breastfeeding_minutes: number | null;
      };
      history: Array<{
        date: string;
        count: number;
        portion_count: number;
        bottle_portion_count: number;
        breastfeeding_portion_count: number;
        total_amount_ml: number;
        total_breastfeeding_minutes: number;
        average_amount_ml: number | null;
        average_breastfeeding_minutes: number | null;
      }>;
    }>;
  };
  const feedingAnalytics = dashboard.analytics.find((activity) => activity.activity_id === feedingId)!;
  assert.deepEqual(feedingAnalytics.average, {
    count: 5 / 3,
    portion_count: 2,
    bottle_portion_count: 1,
    breastfeeding_portion_count: 1,
    total_amount_ml: 230 / 3,
    total_breastfeeding_minutes: 20,
    average_amount_ml: 230 / 3,
    average_breastfeeding_minutes: 20,
  });
  const history = feedingAnalytics.history;
  const metricsByDate = new Map(history.map((day) => [day.date, day]));
  assert.deepEqual(metricsByDate.get("2026-09-20"), {
    date: "2026-09-20",
    count: 3,
    portion_count: 4,
    bottle_portion_count: 2,
    breastfeeding_portion_count: 2,
    total_amount_ml: 150,
    total_breastfeeding_minutes: 30,
    average_amount_ml: 75,
    average_breastfeeding_minutes: 15,
    excluded_from_average: false,
  });
  assert.deepEqual(metricsByDate.get("2026-09-19"), {
    date: "2026-09-19",
    count: 1,
    portion_count: 1,
    bottle_portion_count: 0,
    breastfeeding_portion_count: 1,
    total_amount_ml: 0,
    total_breastfeeding_minutes: 30,
    average_amount_ml: null,
    average_breastfeeding_minutes: 30,
    excluded_from_average: false,
  });
  assert.deepEqual(metricsByDate.get("2026-09-18"), {
    date: "2026-09-18",
    count: 1,
    portion_count: 1,
    bottle_portion_count: 1,
    breastfeeding_portion_count: 0,
    total_amount_ml: 80,
    total_breastfeeding_minutes: 0,
    average_amount_ml: 80,
    average_breastfeeding_minutes: null,
    excluded_from_average: false,
  });
});

test("feeding analytics count bottle and breastfeeding portions independently", async () => {
  const alex = new ApiClient();
  await alex.signIn("alex@nurture.local", "nurture-demo");
  const { childId, feedingId } = await createChildWithFeeding(alex, "Portion categories");
  const response = await logFeeding(
    alex,
    childId,
    feedingId,
    "2026-09-17T12:00:00.000Z",
    [
      { kind: "formula", deliveryMethod: "bottle", amountMl: 40 },
      { kind: "breast_milk", deliveryMethod: "bottle", amountMl: 60 },
      { kind: "breast_milk", deliveryMethod: "breastfeeding", durationMinutes: 12 },
      { kind: "breast_milk", deliveryMethod: "breastfeeding", durationMinutes: 8 },
    ],
  );
  assert.equal(response.status, 201);

  const dashboardResponse = await alex.request(`/api/children/${childId}/dashboard`);
  const dashboard = (await dashboardResponse.json()) as {
    analytics: Array<{
      activity_id: string;
      history: Array<{
        date: string;
        count: number;
        portion_count: number;
        bottle_portion_count: number;
        breastfeeding_portion_count: number;
      }>;
    }>;
  };
  const day = dashboard.analytics
    .find((activity) => activity.activity_id === feedingId)!
    .history.find((item) => item.date === "2026-09-17");
  assert.deepEqual(day, {
    date: "2026-09-17",
    count: 1,
    portion_count: 4,
    bottle_portion_count: 2,
    breastfeeding_portion_count: 2,
    total_amount_ml: 100,
    total_breastfeeding_minutes: 20,
    average_amount_ml: 100,
    average_breastfeeding_minutes: 20,
    excluded_from_average: false,
  });
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

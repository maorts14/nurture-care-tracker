import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { usableIntervals } from "./analytics.js";
import { pool } from "./database.js";

type Session = { userId: string };
const port = Number(process.env.PORT ?? 3001);
const secret = process.env.JWT_SECRET ?? "development-only-secret-change-me";
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.WEB_ORIGIN ?? "http://localhost:8080",
    credentials: true,
  },
});

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:8080",
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());

app.get("/api/health", async (_request, response) => {
  try {
    await pool.query("SELECT 1");
    response.json({ status: "ok" });
  } catch {
    response.status(503).json({ status: "unavailable" });
  }
});

function sessionFrom(request: Request): Session | null {
  const token = request.cookies.nurture_session as string | undefined;
  if (!token) return null;
  try {
    return jwt.verify(token, secret) as Session;
  } catch {
    return null;
  }
}
function requireSession(request: Request, response: Response): Session | null {
  const session = sessionFrom(request);
  if (!session) response.status(401).json({ error: "Sign in is required" });
  return session;
}
async function membership(childId: string, userId: string) {
  return pool.query<{ role: "owner" | "caregiver" | "viewer" }>(
    "SELECT role FROM child_membership WHERE child_id = $1 AND user_id = $2",
    [childId, userId],
  );
}
function childRoom(childId: string) {
  return `child:${childId}`;
}

app.post("/api/auth/sign-in", async (request, response) => {
  const { email, password } = request.body as {
    email: string;
    password: string;
  };
  const result = await pool.query<{
    id: string;
    password_hash: string;
    display_name: string;
    locale: string;
  }>(
    "SELECT id, password_hash, display_name, locale FROM app_user WHERE email = $1",
    [email],
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    response.status(401).json({ error: "Email or password is incorrect" });
    return;
  }
  const token = jwt.sign({ userId: user.id }, secret, { expiresIn: "30d" });
  response.cookie("nurture_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 2_592_000_000,
  });
  response.json({ id: user.id, name: user.display_name, locale: user.locale });
});
app.post("/api/auth/sign-out", (_request, response) => {
  response.clearCookie("nurture_session");
  response.status(204).end();
});
app.post("/api/auth/register", async (request, response) => {
  const { email, password, displayName, locale } = request.body as {
    email: string;
    password: string;
    displayName: string;
    locale: "en" | "he";
  };
  if (!email || !password || !displayName) {
    response
      .status(400)
      .json({ error: "Name, email, and password are required" });
    return;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query<{
      id: string;
      email: string;
      display_name: string;
      locale: string;
    }>(
      "INSERT INTO app_user (email, password_hash, display_name, locale, email_verified_at) VALUES ($1, $2, $3, $4, now()) RETURNING id, email, display_name, locale",
      [email, passwordHash, displayName, locale],
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, secret, { expiresIn: "30d" });
    response.cookie("nurture_session", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 2_592_000_000,
    });
    response.status(201).json(user);
  } catch {
    response.status(409).json({ error: "An account already uses that email" });
  }
});
app.get("/api/auth/google", (request, response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = process.env.APP_URL ?? "http://localhost:8080";
  if (!clientId) {
    response.status(503).json({
      error:
        "Google login needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server environment",
    });
    return;
  }
  const state = jwt.sign({ returnTo: "/" }, secret, { expiresIn: "10m" });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${appUrl}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  response.redirect(url.toString());
});
app.get("/api/auth/google/callback", async (request, response) => {
  const { code } = request.query as { code?: string };
  const appUrl = process.env.APP_URL ?? "http://localhost:8080";
  if (
    !code ||
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  ) {
    response.status(400).send("Google login is not configured");
    return;
  }
  let profile: { email: string; name: string };
  try {
    const tokenResult = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: `${appUrl}/api/auth/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResult.ok) {
      response.status(502).send("Google sign-in could not be completed");
      return;
    }
    const tokenData = (await tokenResult.json()) as { access_token: string };
    const profileResult = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    );
    if (!profileResult.ok) {
      response.status(502).send("Google sign-in could not be completed");
      return;
    }
    profile = (await profileResult.json()) as { email: string; name: string };
  } catch {
    response.status(502).send("Google sign-in could not be completed");
    return;
  }
  const result = await pool.query<{ id: string }>(
    "INSERT INTO app_user (email, password_hash, display_name, email_verified_at) VALUES ($1, '', $2, now()) ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id",
    [profile.email, profile.name],
  );
  response.cookie(
    "nurture_session",
    jwt.sign({ userId: result.rows[0].id }, secret, { expiresIn: "30d" }),
    {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 2_592_000_000,
    },
  );
  response.redirect("/");
});

app.get("/api/me", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const result = await pool.query(
    "SELECT id, email, display_name, locale FROM app_user WHERE id = $1",
    [session.userId],
  );
  if (!result.rowCount) {
    response.clearCookie("nurture_session");
    response.status(401).json({ error: "Sign in is required" });
    return;
  }
  response.json(result.rows[0]);
});
app.get("/api/children", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const result = await pool.query(
    `SELECT child.id, child.name, child.timezone, child.birth_date, membership.role FROM child_membership AS membership JOIN child ON child.id = membership.child_id WHERE membership.user_id = $1 AND child.archived_at IS NULL ORDER BY child.created_at`,
    [session.userId],
  );
  response.json(result.rows);
});
app.get("/api/children/:childId/members", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const result = await pool.query<{
    id: string;
    display_name: string;
    email: string;
    role: "owner" | "caregiver" | "viewer";
    joined_at: string;
  }>(
    `SELECT member.user_id AS id, user_account.display_name, user_account.email, member.role, member.joined_at
     FROM child_membership AS member
     JOIN app_user AS user_account ON user_account.id = member.user_id
     JOIN child_membership AS requester ON requester.child_id = member.child_id
     WHERE member.child_id = $1 AND requester.user_id = $2
     ORDER BY CASE member.role WHEN 'owner' THEN 0 ELSE 1 END, member.joined_at ASC`,
    [request.params.childId, session.userId],
  );
  response.json(result.rows);
});
app.put("/api/children/:childId/members/:memberId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { role } = request.body as { role: "caregiver" | "viewer" };
  if (role !== "caregiver" && role !== "viewer") {
    response.status(400).json({ error: "Choose caregiver or viewer access" });
    return;
  }
  const updated = await pool.query<{ user_id: string }>(
    `UPDATE child_membership AS member
     SET role = $1
     FROM child_membership AS owner
     WHERE member.child_id = $2
       AND member.user_id = $3
       AND member.role <> 'owner'
       AND owner.child_id = member.child_id
       AND owner.user_id = $4
       AND owner.role = 'owner'
     RETURNING member.user_id`,
    [role, request.params.childId, request.params.memberId, session.userId],
  );
  if (updated.rowCount !== 1) {
    response.status(403).json({ error: "Only the owner can change member access" });
    return;
  }
  io.to(childRoom(request.params.childId)).emit("timeline:changed");
  response.status(204).end();
});
app.delete("/api/children/:childId/members/:memberId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const removed = await pool.query<{ user_id: string }>(
    `DELETE FROM child_membership AS member
     USING child_membership AS owner
     WHERE member.child_id = $1
       AND member.user_id = $2
       AND member.role <> 'owner'
       AND owner.child_id = member.child_id
       AND owner.user_id = $3
       AND owner.role = 'owner'
     RETURNING member.user_id`,
    [request.params.childId, request.params.memberId, session.userId],
  );
  if (removed.rowCount !== 1) {
    response.status(403).json({ error: "Only the owner can remove members" });
    return;
  }
  io.to(childRoom(request.params.childId)).emit("timeline:changed");
  response.status(204).end();
});
app.post("/api/children", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { name, timezone, birthDate } = request.body as {
    name: string;
    timezone: string;
    birthDate?: string;
  };
  if (!name || !timezone) {
    response
      .status(400)
      .json({ error: "Child name and timezone are required" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const child = await client.query<{ id: string }>(
      "INSERT INTO child (name, timezone, birth_date) VALUES ($1, $2, $3) RETURNING id",
      [name, timezone, birthDate ?? null],
    );
    const id = child.rows[0].id;
    await client.query(
      "INSERT INTO child_membership (child_id, user_id, role) VALUES ($1, $2, 'owner')",
      [id, session.userId],
    );
    await client.query(
      "INSERT INTO activity_definition (child_id, name, kind, color) VALUES ($1, 'Feeding', 'feeding', '#f3654b'), ($1, 'Diaper change', 'diaper', '#526cdb')",
      [id],
    );
    await client.query(
      `
      WITH defaults (kind, field_key, label, field_type, unit, options, dashboard_metrics) AS (
        VALUES
          ('diaper'::activity_kind, 'type', 'Diaper type', 'select', NULL, '["Wet", "Dirty", "Mixed"]'::jsonb, '["count"]'::jsonb)
      )
      INSERT INTO activity_field_definition (activity_id, field_key, label, field_type, unit, options, dashboard_metrics)
      SELECT activity.id, defaults.field_key, defaults.label, defaults.field_type, defaults.unit, defaults.options, defaults.dashboard_metrics
      FROM activity_definition AS activity
      JOIN defaults ON defaults.kind = activity.kind
      WHERE activity.child_id = $1`,
      [id],
    );
    await client.query("COMMIT");
    response.status(201).json({ id });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.put("/api/children/:childId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { name } = request.body as { name: string };
  if (!name.trim()) {
    response.status(400).json({ error: "Child name is required" });
    return;
  }
  const updated = await pool.query(
    "UPDATE child SET name = $1 WHERE id = $2 AND EXISTS (SELECT 1 FROM child_membership WHERE child_id = child.id AND user_id = $3 AND role = 'owner') RETURNING id",
    [name.trim(), request.params.childId, session.userId],
  );
  if (updated.rowCount !== 1) {
    response
      .status(403)
      .json({ error: "Only a child owner can rename this profile" });
    return;
  }
  io.to(childRoom(request.params.childId)).emit("timeline:changed");
  response.status(204).end();
});
app.delete("/api/children/:childId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const archived = await pool.query(
    "UPDATE child SET archived_at = now() WHERE id = $1 AND EXISTS (SELECT 1 FROM child_membership WHERE child_id = child.id AND user_id = $2 AND role = 'owner') RETURNING id",
    [request.params.childId, session.userId],
  );
  if (archived.rowCount !== 1) {
    response
      .status(403)
      .json({ error: "Only a child owner can delete this profile" });
    return;
  }
  io.to(childRoom(request.params.childId)).emit("timeline:changed");
  response.status(204).end();
});
app.get("/api/children/:childId/leave-preview", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { childId } = request.params;
  const member = await pool.query<{
    role: "owner" | "caregiver" | "viewer";
    child_name: string;
  }>(
    "SELECT membership.role, child.name AS child_name FROM child_membership AS membership JOIN child ON child.id = membership.child_id WHERE membership.child_id = $1 AND membership.user_id = $2 AND child.archived_at IS NULL",
    [childId, session.userId],
  );
  if (member.rowCount !== 1) {
    response.status(404).json({ error: "This care space is not available" });
    return;
  }
  if (member.rows[0].role !== "owner") {
    response.json({ action: "leave", child_name: member.rows[0].child_name });
    return;
  }
  const successor = await pool.query<{ display_name: string }>(
    "SELECT user_account.display_name FROM child_membership AS membership JOIN app_user AS user_account ON user_account.id = membership.user_id WHERE membership.child_id = $1 AND membership.user_id <> $2 ORDER BY membership.joined_at ASC LIMIT 1",
    [childId, session.userId],
  );
  response.json(
    successor.rowCount
      ? {
          action: "transfer",
          child_name: member.rows[0].child_name,
          successor_name: successor.rows[0].display_name,
        }
      : { action: "delete", child_name: member.rows[0].child_name },
  );
});
app.post("/api/children/:childId/leave", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { childId } = request.params;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const member = await client.query<{
      role: "owner" | "caregiver" | "viewer";
    }>(
      "SELECT membership.role FROM child JOIN child_membership AS membership ON membership.child_id = child.id WHERE child.id = $1 AND membership.user_id = $2 AND child.archived_at IS NULL FOR UPDATE OF child, membership",
      [childId, session.userId],
    );
    if (member.rowCount !== 1) {
      await client.query("ROLLBACK");
      response.status(404).json({ error: "This care space is not available" });
      return;
    }
    if (member.rows[0].role !== "owner") {
      await client.query(
        "DELETE FROM child_membership WHERE child_id = $1 AND user_id = $2",
        [childId, session.userId],
      );
      await client.query("COMMIT");
      io.to(childRoom(childId)).emit("timeline:changed");
      response.status(204).end();
      return;
    }
    const successor = await client.query<{ user_id: string }>(
      "SELECT user_id FROM child_membership WHERE child_id = $1 AND user_id <> $2 ORDER BY joined_at ASC LIMIT 1 FOR UPDATE",
      [childId, session.userId],
    );
    if (successor.rowCount) {
      await client.query(
        "UPDATE child_membership SET role = 'owner' WHERE child_id = $1 AND user_id = $2",
        [childId, successor.rows[0].user_id],
      );
      await client.query(
        "DELETE FROM child_membership WHERE child_id = $1 AND user_id = $2",
        [childId, session.userId],
      );
    } else {
      await client.query("DELETE FROM child WHERE id = $1", [childId]);
    }
    await client.query("COMMIT");
    io.to(childRoom(childId)).emit("timeline:changed");
    response.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.put("/api/me/locale", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { locale } = request.body as { locale: "en" | "he" };
  if (locale !== "en" && locale !== "he") {
    response.status(400).json({ error: "Unsupported locale" });
    return;
  }
  await pool.query("UPDATE app_user SET locale = $1 WHERE id = $2", [
    locale,
    session.userId,
  ]);
  response.status(204).end();
});
app.get("/api/children/:childId/dashboard", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { childId } = request.params;
  const access = await membership(childId, session.userId);
  if (access.rowCount !== 1) {
    response.status(403).json({ error: "Child access is required" });
    return;
  }
  const [timeline, activities, fields, reminders, gaps, analyticsRows] = await Promise.all([
    pool.query(
      `SELECT log.id, log.activity_id, log.event_time, log.event_timezone, log.field_values, log.note, log.created_at, log.created_by AS created_by_id, activity.name AS activity_name, activity.kind, activity.color, author.display_name AS created_by, COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', portion.kind, 'delivery_method', portion.delivery_method, 'amount_ml', portion.amount_ml) ORDER BY portion.position) FROM feeding_portion AS portion WHERE portion.log_id = log.id), '[]'::jsonb) AS feeding_portions, comment_preview.comment_count, comment_preview.first_comment, comment_preview.first_comment_author FROM activity_log AS log JOIN activity_definition AS activity ON activity.id = log.activity_id JOIN app_user AS author ON author.id = log.created_by LEFT JOIN LATERAL (SELECT COUNT(*)::int AS comment_count, (array_agg(comment.body ORDER BY comment.created_at, comment.id))[1] AS first_comment, (array_agg(comment_author.display_name ORDER BY comment.created_at, comment.id))[1] AS first_comment_author FROM log_comment AS comment JOIN app_user AS comment_author ON comment_author.id = comment.created_by WHERE comment.log_id = log.id) AS comment_preview ON true WHERE log.child_id = $1 ORDER BY log.event_time DESC LIMIT 100`,
      [childId],
    ),
    pool.query(
      "SELECT id, name, kind, color FROM activity_definition WHERE child_id = $1 AND archived_at IS NULL ORDER BY created_at",
      [childId],
    ),
    pool.query(
      `SELECT field.id, field.activity_id, field.field_key, field.label, field.field_type, field.unit, field.options, field.dashboard_metrics FROM activity_field_definition AS field JOIN activity_definition AS activity ON activity.id = field.activity_id WHERE activity.child_id = $1 AND field.archived_at IS NULL ORDER BY field.id`,
      [childId],
    ),
    pool.query(
      `SELECT reminder.*, activity.name AS activity_name, activity.color FROM reminder LEFT JOIN activity_definition AS activity ON activity.id = reminder.activity_id WHERE reminder.child_id = $1 AND reminder.completed_at IS NULL ORDER BY reminder.scheduled_for NULLS LAST`,
      [childId],
    ),
    pool.query(
      "SELECT starts_at, ends_at, reason FROM care_gap WHERE child_id = $1 ORDER BY starts_at DESC",
      [childId],
    ),
    pool.query(
      `WITH child_timezone AS (
         SELECT timezone FROM child WHERE id = $1
       ),
       log_metrics AS (
         SELECT log.activity_id,
           (log.event_time AT TIME ZONE child_timezone.timezone)::date AS local_date,
           log.event_time,
           portions.portion_count,
           portions.total_amount_ml,
           CASE WHEN portions.portion_count > 0 THEN 1 ELSE 0 END AS measured_feed_count
         FROM activity_log AS log
         CROSS JOIN child_timezone
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS portion_count,
             COALESCE(SUM(portion.amount_ml), 0)::float8 AS total_amount_ml
           FROM feeding_portion AS portion
           WHERE portion.log_id = log.id
         ) AS portions ON true
         WHERE log.child_id = $1
       ),
       daily AS (
         SELECT activity_id, local_date,
           COUNT(*)::int AS count,
           COALESCE(SUM(portion_count), 0)::int AS portion_count,
           COALESCE(SUM(total_amount_ml), 0)::float8 AS total_amount_ml,
           COALESCE(SUM(measured_feed_count), 0)::int AS measured_feed_count
         FROM log_metrics
         GROUP BY activity_id, local_date
       ),
       average_metrics AS (
         SELECT activity_id,
           AVG(count)::float8 AS count,
           AVG(portion_count)::float8 AS portion_count,
           AVG(total_amount_ml)::float8 AS total_amount_ml,
           SUM(total_amount_ml) / NULLIF(SUM(measured_feed_count), 0)::float8 AS average_amount_ml
         FROM daily
         GROUP BY activity_id
       ),
       calendar_day_metrics AS (
         SELECT daily.*
         FROM daily
         CROSS JOIN child_timezone
         WHERE daily.local_date = (now() AT TIME ZONE child_timezone.timezone)::date
       ),
       last_24_hours_metrics AS (
         SELECT activity_id,
           COUNT(*)::int AS count,
           COALESCE(SUM(portion_count), 0)::int AS portion_count,
           COALESCE(SUM(total_amount_ml), 0)::float8 AS total_amount_ml,
           SUM(total_amount_ml) / NULLIF(SUM(measured_feed_count), 0)::float8 AS average_amount_ml
         FROM log_metrics
         WHERE event_time >= now() - INTERVAL '24 hours'
         GROUP BY activity_id
       ),
       ranked_history AS (
         SELECT daily.*, ROW_NUMBER() OVER (PARTITION BY activity_id ORDER BY local_date DESC) AS position
         FROM daily
         CROSS JOIN child_timezone
         WHERE daily.local_date < (now() AT TIME ZONE child_timezone.timezone)::date
       ),
       history_metrics AS (
         SELECT activity_id,
           jsonb_agg(
             jsonb_build_object(
               'date', local_date,
               'count', count,
               'portion_count', portion_count,
               'total_amount_ml', total_amount_ml,
               'average_amount_ml', total_amount_ml / NULLIF(measured_feed_count, 0)::float8
             )
             ORDER BY local_date DESC
           ) AS days
         FROM ranked_history
         WHERE position <= 14
         GROUP BY activity_id
       )
       SELECT activity.id AS activity_id,
         COALESCE(average_metrics.count, 0)::float8 AS average_count,
         COALESCE(average_metrics.portion_count, 0)::float8 AS average_portion_count,
         COALESCE(average_metrics.total_amount_ml, 0)::float8 AS average_total_amount_ml,
         average_metrics.average_amount_ml,
         COALESCE(calendar_day_metrics.count, 0)::int AS calendar_day_count,
         COALESCE(calendar_day_metrics.portion_count, 0)::int AS calendar_day_portion_count,
         COALESCE(calendar_day_metrics.total_amount_ml, 0)::float8 AS calendar_day_total_amount_ml,
         calendar_day_metrics.total_amount_ml / NULLIF(calendar_day_metrics.measured_feed_count, 0)::float8 AS calendar_day_average_amount_ml,
         COALESCE(last_24_hours_metrics.count, 0)::int AS last_24_hours_count,
         COALESCE(last_24_hours_metrics.portion_count, 0)::int AS last_24_hours_portion_count,
         COALESCE(last_24_hours_metrics.total_amount_ml, 0)::float8 AS last_24_hours_total_amount_ml,
         last_24_hours_metrics.average_amount_ml AS last_24_hours_average_amount_ml,
         COALESCE(history_metrics.days, '[]'::jsonb) AS history
       FROM activity_definition AS activity
       LEFT JOIN average_metrics ON average_metrics.activity_id = activity.id
       LEFT JOIN calendar_day_metrics ON calendar_day_metrics.activity_id = activity.id
       LEFT JOIN last_24_hours_metrics ON last_24_hours_metrics.activity_id = activity.id
       LEFT JOIN history_metrics ON history_metrics.activity_id = activity.id
       WHERE activity.child_id = $1 AND activity.archived_at IS NULL
       ORDER BY activity.created_at`,
      [childId],
    ),
  ]);
  const activitiesWithFields = activities.rows.map((activity) => ({
    ...activity,
    fields: fields.rows.filter((field) => field.activity_id === activity.id),
  }));
  const metrics = (row: {
    count: number;
    portion_count: number;
    total_amount_ml: number;
    average_amount_ml: number | null;
  }) => ({
    count: Number(row.count),
    portion_count: Number(row.portion_count),
    total_amount_ml: Number(row.total_amount_ml),
    average_amount_ml:
      row.average_amount_ml === null ? null : Number(row.average_amount_ml),
  });
  const analytics = analyticsRows.rows.map((row) => ({
    activity_id: row.activity_id,
    average: metrics({
      count: row.average_count,
      portion_count: row.average_portion_count,
      total_amount_ml: row.average_total_amount_ml,
      average_amount_ml: row.average_amount_ml,
    }),
    calendar_day: metrics({
      count: row.calendar_day_count,
      portion_count: row.calendar_day_portion_count,
      total_amount_ml: row.calendar_day_total_amount_ml,
      average_amount_ml: row.calendar_day_average_amount_ml,
    }),
    last_24_hours: metrics({
      count: row.last_24_hours_count,
      portion_count: row.last_24_hours_portion_count,
      total_amount_ml: row.last_24_hours_total_amount_ml,
      average_amount_ml: row.last_24_hours_average_amount_ml,
    }),
    history: row.history.map(
      (day: {
        date: string;
        count: number;
        portion_count: number;
        total_amount_ml: number;
        average_amount_ml: number | null;
      }) => ({
        date: String(day.date).slice(0, 10),
        ...metrics(day),
      }),
    ),
  }));
  response.json({
    role: access.rows[0].role,
    timeline: timeline.rows,
    activities: activitiesWithFields,
    reminders: reminders.rows,
    gaps: gaps.rows,
    analytics,
  });
});
app.post("/api/children/:childId/logs", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { childId } = request.params;
  const { activityId, eventTime, eventTimezone, fieldValues, portions, note } =
    request.body as {
      activityId: string;
      eventTime: string;
      eventTimezone: string;
      fieldValues: Record<string, unknown>;
      portions?: {
        kind: "breast_milk" | "formula";
        deliveryMethod: "bottle" | "breastfeeding";
        amountMl: number;
      }[];
      note?: string;
    };
  if (!activityId || !eventTime || !eventTimezone) {
    response
      .status(400)
      .json({ error: "Activity and event time are required" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const access = await client.query<{
      kind: "feeding" | "diaper" | "custom";
    }>(
      `SELECT activity.kind FROM child_membership AS membership JOIN activity_definition AS activity ON activity.id = $2 AND activity.child_id = membership.child_id WHERE membership.child_id = $1 AND membership.user_id = $3 AND membership.role IN ('owner', 'caregiver') AND activity.archived_at IS NULL`,
      [childId, activityId, session.userId],
    );
    if (access.rowCount !== 1) {
      await client.query("ROLLBACK");
      response.status(403).json({ error: "You cannot log this activity" });
      return;
    }
    const feedingPortions =
      access.rows[0].kind === "feeding"
        ? (portions ?? []).map((portion, position) => ({
            kind: portion.kind,
            delivery_method: portion.deliveryMethod,
            amount_ml: Number(portion.amountMl),
            position,
          }))
        : [];
    if (
      access.rows[0].kind === "feeding" &&
      (!feedingPortions.length ||
        feedingPortions.some(
          (portion) =>
            (portion.kind !== "breast_milk" && portion.kind !== "formula") ||
            (portion.delivery_method !== "bottle" &&
              portion.delivery_method !== "breastfeeding") ||
            !Number.isFinite(portion.amount_ml) ||
            portion.amount_ml <= 0,
        ))
    ) {
      await client.query("ROLLBACK");
      response.status(400).json({ error: "Add at least one milk portion" });
      return;
    }
    const inserted = await client.query(
      `INSERT INTO activity_log (child_id, activity_id, event_time, event_timezone, field_values, note, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, activity_id, event_time, event_timezone, field_values, note, created_at`,
      [
        childId,
        activityId,
        eventTime,
        eventTimezone,
        access.rows[0].kind === "feeding" ? {} : fieldValues,
        note ?? null,
        session.userId,
      ],
    );
    if (feedingPortions.length)
      await client.query(
        `INSERT INTO feeding_portion (log_id, kind, delivery_method, amount_ml, position)
         SELECT $1, portion.kind, portion.delivery_method, portion.amount_ml, portion.position
         FROM jsonb_to_recordset($2::jsonb) AS portion(kind text, delivery_method text, amount_ml numeric, position smallint)`,
        [inserted.rows[0].id, JSON.stringify(feedingPortions)],
      );
    await client.query("COMMIT");
    io.to(childRoom(childId)).emit("timeline:changed");
    response.status(201).json(inserted.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.delete("/api/logs/:logId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const deleted = await pool.query<{ child_id: string }>(
    `DELETE FROM activity_log AS log USING child_membership AS membership WHERE log.id = $1 AND membership.child_id = log.child_id AND membership.user_id = $2 AND (membership.role = 'owner' OR log.created_by = $2) RETURNING log.child_id`,
    [request.params.logId, session.userId],
  );
  if (deleted.rowCount !== 1) {
    response
      .status(403)
      .json({ error: "Only the log creator or owner can delete this record" });
    return;
  }
  io.to(childRoom(deleted.rows[0].child_id)).emit("timeline:changed");
  response.status(204).end();
});
app.put("/api/logs/:logId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { activityId, eventTime, eventTimezone, fieldValues, portions, note } =
    request.body as {
      activityId: string;
      eventTime: string;
      eventTimezone: string;
      fieldValues: Record<string, unknown>;
      portions?: {
        kind: "breast_milk" | "formula";
        deliveryMethod: "bottle" | "breastfeeding";
        amountMl: number;
      }[];
      note?: string;
    };
  if (!activityId || !eventTime || !eventTimezone) {
    response
      .status(400)
      .json({ error: "Activity and event time are required" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const access = await client.query<{
      child_id: string;
      kind: "feeding" | "diaper" | "custom";
    }>(
      `SELECT log.child_id, activity.kind
       FROM activity_log AS log
       JOIN child_membership AS membership ON membership.child_id = log.child_id
       JOIN activity_definition AS activity ON activity.id = $2 AND activity.child_id = log.child_id
       WHERE log.id = $1 AND membership.user_id = $3 AND (membership.role = 'owner' OR log.created_by = $3) AND activity.archived_at IS NULL`,
      [request.params.logId, activityId, session.userId],
    );
    if (access.rowCount !== 1) {
      await client.query("ROLLBACK");
      response
        .status(403)
        .json({ error: "Only the log creator or owner can edit this record" });
      return;
    }
    const feedingPortions =
      access.rows[0].kind === "feeding"
        ? (portions ?? []).map((portion, position) => ({
            kind: portion.kind,
            delivery_method: portion.deliveryMethod,
            amount_ml: Number(portion.amountMl),
            position,
          }))
        : [];
    if (
      access.rows[0].kind === "feeding" &&
      (!feedingPortions.length ||
        feedingPortions.some(
          (portion) =>
            (portion.kind !== "breast_milk" && portion.kind !== "formula") ||
            (portion.delivery_method !== "bottle" &&
              portion.delivery_method !== "breastfeeding") ||
            !Number.isFinite(portion.amount_ml) ||
            portion.amount_ml <= 0,
        ))
    ) {
      await client.query("ROLLBACK");
      response.status(400).json({ error: "Add at least one milk portion" });
      return;
    }
    await client.query(
      `UPDATE activity_log
       SET activity_id = $2, event_time = $3, event_timezone = $4, field_values = $5, note = $6
       WHERE id = $1`,
      [
        request.params.logId,
        activityId,
        eventTime,
        eventTimezone,
        access.rows[0].kind === "feeding" ? {} : fieldValues,
        note ?? null,
      ],
    );
    await client.query("DELETE FROM feeding_portion WHERE log_id = $1", [
      request.params.logId,
    ]);
    if (feedingPortions.length)
      await client.query(
        `INSERT INTO feeding_portion (log_id, kind, delivery_method, amount_ml, position)
         SELECT $1, portion.kind, portion.delivery_method, portion.amount_ml, portion.position
         FROM jsonb_to_recordset($2::jsonb) AS portion(kind text, delivery_method text, amount_ml numeric, position smallint)`,
        [request.params.logId, JSON.stringify(feedingPortions)],
      );
    await client.query("COMMIT");
    io.to(childRoom(access.rows[0].child_id)).emit("timeline:changed");
    response.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.post("/api/children/:childId/gaps", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { childId } = request.params;
  const { startsAt, endsAt, reason } = request.body as {
    startsAt: string;
    endsAt: string;
    reason?: string;
  };
  const access = await membership(childId, session.userId);
  if (access.rows[0]?.role === "viewer") {
    response.status(403).json({ error: "Caregiver access is required" });
    return;
  }
  const inserted = await pool.query(
    "INSERT INTO care_gap (child_id, starts_at, ends_at, reason, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [childId, startsAt, endsAt, reason ?? null, session.userId],
  );
  io.to(childRoom(childId)).emit("timeline:changed");
  response.status(201).json(inserted.rows[0]);
});
app.post("/api/children/:childId/invitations", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { childId } = request.params;
  const { email: rawEmail, role } = request.body as {
    email?: string;
    role: "caregiver" | "viewer";
  };
  const email = rawEmail?.trim().toLowerCase() || null;
  const access = await membership(childId, session.userId);
  if (access.rows[0]?.role !== "owner") {
    response.status(403).json({ error: "Owner access is required" });
    return;
  }
  const invite = await pool.query<{ token: string }>(
    "INSERT INTO child_invitation (child_id, email, role, invited_by) VALUES ($1, $2, $3, $4) RETURNING token",
    [childId, email, role, session.userId],
  );
  response.status(201).json({
    token: invite.rows[0].token,
    acceptUrl: `/?invite=${invite.rows[0].token}`,
  });
});
app.get("/api/invitations/:token", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { token } = request.params;
  const invite = await pool.query<{
    child_name: string;
    invited_by_name: string;
    created_at: string;
    role: "caregiver" | "viewer";
  }>(
    `SELECT child.name AS child_name, inviter.display_name AS invited_by_name, invitation.created_at, invitation.role FROM child_invitation AS invitation JOIN child ON child.id = invitation.child_id JOIN app_user AS inviter ON inviter.id = invitation.invited_by JOIN app_user AS recipient ON recipient.id = $2 WHERE invitation.token = $1 AND invitation.accepted_at IS NULL AND invitation.expires_at > now() AND (invitation.email IS NULL OR lower(invitation.email) = lower(recipient.email))`,
    [token, session.userId],
  );
  if (invite.rowCount !== 1) {
    response.status(404).json({ error: "This invitation is not available" });
    return;
  }
  response.json(invite.rows[0]);
});
app.post("/api/invitations/:token/accept", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { token } = request.params;
  const invite = await pool.query<{ child_id: string }>(
    `WITH accepted_invitation AS (
       UPDATE child_invitation
       SET accepted_at = now()
       WHERE token = $1
         AND accepted_at IS NULL
         AND expires_at > now()
         AND (email IS NULL OR lower(email) = lower((SELECT email FROM app_user WHERE id = $2)))
       RETURNING child_id, role
     ), membership AS (
       INSERT INTO child_membership (child_id, user_id, role)
       SELECT child_id, $2, role FROM accepted_invitation
       ON CONFLICT (child_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING child_id
     )
     SELECT child_id FROM membership`,
    [token, session.userId],
  );
  if (invite.rowCount !== 1) {
    response
      .status(404)
      .json({ error: "This invitation is not available for your account" });
    return;
  }
  response.status(204).end();
});
app.post("/api/children/:childId/activities", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { childId } = request.params;
  const { name, color, fields } = request.body as {
    name: string;
    color: string;
    fields: {
      key: string;
      label: string;
      type: string;
      unit?: string;
      metrics?: string[];
    }[];
  };
  const access = await membership(childId, session.userId);
  if (access.rows[0]?.role !== "owner") {
    response.status(403).json({ error: "Owner access is required" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const activity = await client.query<{ id: string }>(
      "INSERT INTO activity_definition (child_id, name, kind, color) VALUES ($1, $2, 'custom', $3) RETURNING id",
      [childId, name, color],
    );
    for (const field of fields)
      await client.query(
        "INSERT INTO activity_field_definition (activity_id, field_key, label, field_type, unit, dashboard_metrics) VALUES ($1, $2, $3, $4, $5, $6::jsonb)",
        [
          activity.rows[0].id,
          field.key,
          field.label,
          field.type,
          field.unit ?? null,
          JSON.stringify(field.metrics ?? []),
        ],
      );
    await client.query("COMMIT");
    io.to(childRoom(childId)).emit("timeline:changed");
    response.status(201).json(activity.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.post("/api/activities/:activityId/fields", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { fieldKey, label, fieldType, unit, options, metrics } =
    request.body as {
      fieldKey: string;
      label: string;
      fieldType: string;
      unit?: string;
      options?: string[];
      metrics?: string[];
    };
  if (
    !fieldKey ||
    !label ||
    !["text", "number", "boolean", "select", "duration"].includes(fieldType)
  ) {
    response
      .status(400)
      .json({ error: "A valid field name and type are required" });
    return;
  }
  const activity = await pool.query<{ child_id: string }>(
    `SELECT activity.child_id FROM activity_definition AS activity JOIN child_membership AS membership ON membership.child_id = activity.child_id WHERE activity.id = $1 AND membership.user_id = $2 AND membership.role = 'owner'`,
    [request.params.activityId, session.userId],
  );
  if (activity.rowCount !== 1) {
    response.status(403).json({ error: "Owner access is required" });
    return;
  }
  await pool.query(
    "INSERT INTO activity_field_definition (activity_id, field_key, label, field_type, unit, options, dashboard_metrics) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)",
    [
      request.params.activityId,
      fieldKey,
      label,
      fieldType,
      unit ?? null,
      JSON.stringify(options ?? []),
      JSON.stringify(metrics ?? []),
    ],
  );
  io.to(childRoom(activity.rows[0].child_id)).emit("timeline:changed");
  response.status(201).end();
});
app.delete("/api/activities/:activityId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const archived = await pool.query<{ child_id: string }>(
    `UPDATE activity_definition AS activity SET archived_at = now() FROM child_membership AS membership WHERE activity.id = $1 AND membership.child_id = activity.child_id AND membership.user_id = $2 AND membership.role = 'owner' RETURNING activity.child_id`,
    [request.params.activityId, session.userId],
  );
  if (archived.rowCount !== 1) {
    response.status(403).json({ error: "Owner access is required" });
    return;
  }
  io.to(childRoom(archived.rows[0].child_id)).emit("timeline:changed");
  response.status(204).end();
});
app.post("/api/children/:childId/reminders", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { childId } = request.params;
  const { title, activityId, kind, intervalMinutes, scheduledFor } =
    request.body as {
      title: string;
      activityId?: string;
      kind: "interval" | "one_time";
      intervalMinutes?: number;
      scheduledFor?: string;
    };
  const access = await membership(childId, session.userId);
  if (access.rows[0]?.role !== "owner") {
    response.status(403).json({ error: "Owner access is required" });
    return;
  }
  const inserted = await pool.query(
    "INSERT INTO reminder (child_id, activity_id, kind, interval_minutes, scheduled_for, title) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [
      childId,
      activityId ?? null,
      kind,
      intervalMinutes ?? null,
      scheduledFor ?? null,
      title,
    ],
  );
  io.to(childRoom(childId)).emit("timeline:changed");
  response.status(201).json(inserted.rows[0]);
});
app.post("/api/reminders/:reminderId/complete", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const result = await pool.query(
    "UPDATE reminder SET completed_at = now() WHERE id = $1 AND child_id IN (SELECT child_id FROM child_membership WHERE user_id = $2) RETURNING child_id",
    [request.params.reminderId, session.userId],
  );
  if (result.rowCount !== 1) {
    response.status(404).json({ error: "Reminder not found" });
    return;
  }
  io.to(childRoom(result.rows[0].child_id)).emit("timeline:changed");
  response.status(204).end();
});
app.put("/api/reminders/:reminderId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { title, activityId, kind, intervalMinutes, scheduledFor } =
    request.body as {
      title: string;
      activityId?: string | null;
      kind: "interval" | "one_time";
      intervalMinutes?: number | null;
      scheduledFor?: string | null;
    };
  if (
    !title ||
    !["interval", "one_time"].includes(kind) ||
    (kind === "interval" && (!intervalMinutes || intervalMinutes < 1)) ||
    (kind === "one_time" && !scheduledFor)
  ) {
    response
      .status(400)
      .json({ error: "Provide a valid reminder title and schedule" });
    return;
  }
  const updated = await pool.query<{ child_id: string }>(
    "UPDATE reminder SET title = $1, activity_id = $2, kind = $3, interval_minutes = $4, scheduled_for = $5 WHERE id = $6 AND child_id IN (SELECT child_id FROM child_membership WHERE user_id = $7 AND role = 'owner') RETURNING child_id",
    [
      title,
      activityId ?? null,
      kind,
      kind === "interval" ? intervalMinutes : null,
      kind === "one_time" ? scheduledFor : null,
      request.params.reminderId,
      session.userId,
    ],
  );
  if (updated.rowCount !== 1) {
    response.status(404).json({ error: "Reminder not found" });
    return;
  }
  io.to(childRoom(updated.rows[0].child_id)).emit("timeline:changed");
  response.status(204).end();
});
app.delete("/api/reminders/:reminderId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const result = await pool.query(
    "DELETE FROM reminder WHERE id = $1 AND child_id IN (SELECT child_id FROM child_membership WHERE user_id = $2 AND role = 'owner') RETURNING child_id",
    [request.params.reminderId, session.userId],
  );
  if (result.rowCount !== 1) {
    response.status(404).json({ error: "Reminder not found" });
    return;
  }
  io.to(childRoom(result.rows[0].child_id)).emit("timeline:changed");
  response.status(204).end();
});
app.get("/api/children/:childId/notes", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const access = await membership(request.params.childId, session.userId);
  if (access.rowCount !== 1) {
    response.status(403).json({ error: "Child access is required" });
    return;
  }
  const notes = await pool.query(
    `SELECT note.*, author.display_name AS created_by_name FROM child_note AS note JOIN app_user AS author ON author.id = note.created_by WHERE note.child_id = $1 AND (note.visibility = 'shared' OR note.created_by = $2) ORDER BY note.created_at DESC`,
    [request.params.childId, session.userId],
  );
  response.json(notes.rows);
});
app.post("/api/children/:childId/notes", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { body, visibility } = request.body as {
    body: string;
    visibility: "private" | "shared";
  };
  const access = await membership(request.params.childId, session.userId);
  if (access.rows[0]?.role === "viewer") {
    response.status(403).json({ error: "Caregiver access is required" });
    return;
  }
  const note = await pool.query(
    "INSERT INTO child_note (child_id, body, visibility, created_by) VALUES ($1, $2, $3, $4) RETURNING *",
    [request.params.childId, body, visibility, session.userId],
  );
  io.to(childRoom(request.params.childId)).emit("notes:changed");
  response.status(201).json(note.rows[0]);
});
app.put("/api/notes/:noteId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { body, visibility } = request.body as {
    body: string;
    visibility: "private" | "shared";
  };
  const updated = await pool.query<{ child_id: string }>(
    "UPDATE child_note SET body = $1, visibility = $2 WHERE id = $3 AND created_by = $4 RETURNING child_id",
    [body, visibility, request.params.noteId, session.userId],
  );
  if (updated.rowCount !== 1) {
    response
      .status(403)
      .json({ error: "Only the note creator can edit this note" });
    return;
  }
  io.to(childRoom(updated.rows[0].child_id)).emit("notes:changed");
  response.status(204).end();
});
app.delete("/api/notes/:noteId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const deleted = await pool.query<{ child_id: string }>(
    "DELETE FROM child_note WHERE id = $1 AND created_by = $2 RETURNING child_id",
    [request.params.noteId, session.userId],
  );
  if (deleted.rowCount !== 1) {
    response
      .status(403)
      .json({ error: "Only the note creator can delete this note" });
    return;
  }
  io.to(childRoom(deleted.rows[0].child_id)).emit("notes:changed");
  response.status(204).end();
});
app.get("/api/logs/:logId/comments", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const comments = await pool.query(
    `SELECT comment.*, author.display_name AS created_by_name FROM log_comment AS comment JOIN app_user AS author ON author.id = comment.created_by JOIN activity_log AS log ON log.id = comment.log_id JOIN child_membership AS membership ON membership.child_id = log.child_id WHERE comment.log_id = $1 AND membership.user_id = $2 ORDER BY comment.created_at`,
    [request.params.logId, session.userId],
  );
  response.json(comments.rows);
});
app.post("/api/logs/:logId/comments", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { body } = request.body as { body: string };
  const comment = await pool.query(
    `WITH inserted AS (INSERT INTO log_comment (log_id, body, created_by) SELECT log.id, $2, $3 FROM activity_log AS log JOIN child_membership AS membership ON membership.child_id = log.child_id WHERE log.id = $1 AND membership.user_id = $3 AND membership.role IN ('owner', 'caregiver') RETURNING *) SELECT inserted.*, log.child_id FROM inserted JOIN activity_log AS log ON log.id = inserted.log_id`,
    [request.params.logId, body, session.userId],
  );
  if (comment.rowCount !== 1) {
    response.status(403).json({ error: "You cannot comment on this activity" });
    return;
  }
  io.to(childRoom(comment.rows[0].child_id)).emit("timeline:changed");
  response.status(201).json(comment.rows[0]);
});
app.put("/api/comments/:commentId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { body } = request.body as { body: string };
  const updated = await pool.query(
    "UPDATE log_comment AS comment SET body = $1, updated_at = now() FROM activity_log AS log WHERE comment.id = $2 AND comment.created_by = $3 AND log.id = comment.log_id RETURNING comment.id, log.child_id",
    [body, request.params.commentId, session.userId],
  );
  if (updated.rowCount !== 1) {
    response
      .status(403)
      .json({ error: "Only the comment creator can edit this comment" });
    return;
  }
  io.to(childRoom(updated.rows[0].child_id)).emit("timeline:changed");
  response.status(204).end();
});
app.delete("/api/comments/:commentId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const deleted = await pool.query(
    "DELETE FROM log_comment AS comment USING activity_log AS log WHERE comment.id = $1 AND comment.created_by = $2 AND log.id = comment.log_id RETURNING comment.id, log.child_id",
    [request.params.commentId, session.userId],
  );
  if (deleted.rowCount !== 1) {
    response
      .status(403)
      .json({ error: "Only the comment creator can delete this comment" });
    return;
  }
  io.to(childRoom(deleted.rows[0].child_id)).emit("timeline:changed");
  response.status(204).end();
});
app.get("/api/children/:childId/export.csv", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const access = await membership(request.params.childId, session.userId);
  if (access.rowCount !== 1) {
    response.status(403).json({ error: "Child access is required" });
    return;
  }
  const [logs, reminders] = await Promise.all([
    pool.query(
      `SELECT activity.name, log.event_time, log.field_values, log.note, author.display_name, COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', portion.kind, 'delivery_method', portion.delivery_method, 'amount_ml', portion.amount_ml) ORDER BY portion.position) FROM feeding_portion AS portion WHERE portion.log_id = log.id), '[]'::jsonb) AS feeding_portions FROM activity_log AS log JOIN activity_definition AS activity ON activity.id = log.activity_id JOIN app_user AS author ON author.id = log.created_by WHERE log.child_id = $1 ORDER BY log.event_time DESC`,
      [request.params.childId],
    ),
    pool.query(
      "SELECT title, kind, scheduled_for, interval_minutes FROM reminder WHERE child_id = $1 AND completed_at IS NULL",
      [request.params.childId],
    ),
  ]);
  const escape = (value: unknown) =>
    `\"${String(value ?? "").replaceAll('\"', '\"\"')}\"`;
  const rows = [
    "record_type,activity,event_time,values,note,created_by",
    ...logs.rows.map((row) =>
      [
        "logged",
        row.name,
        row.event_time.toISOString(),
        JSON.stringify({
          ...row.field_values,
          ...(row.feeding_portions.length
            ? { portions: row.feeding_portions }
            : {}),
        }),
        row.note,
        row.display_name,
      ]
        .map(escape)
        .join(","),
    ),
    ...reminders.rows.map((row) =>
      [
        "upcoming",
        row.title,
        row.scheduled_for?.toISOString() ??
          `after ${row.interval_minutes} minutes`,
        row.kind,
        "",
        "",
      ]
        .map(escape)
        .join(","),
    ),
  ];
  response.setHeader("Content-Type", "text/csv");
  response.setHeader(
    "Content-Disposition",
    "attachment; filename=care-report.csv",
  );
  response.send(rows.join("\n"));
});
app.get("/api/children/:childId/export.report", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const access = await membership(request.params.childId, session.userId);
  if (access.rowCount !== 1) {
    response.status(403).send("Child access is required");
    return;
  }
  const [child, logs, reminders] = await Promise.all([
    pool.query("SELECT name FROM child WHERE id = $1", [
      request.params.childId,
    ]),
    pool.query(
      `SELECT activity.name, log.event_time, log.field_values, log.note, author.display_name, COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', portion.kind, 'delivery_method', portion.delivery_method, 'amount_ml', portion.amount_ml) ORDER BY portion.position) FROM feeding_portion AS portion WHERE portion.log_id = log.id), '[]'::jsonb) AS feeding_portions FROM activity_log AS log JOIN activity_definition AS activity ON activity.id = log.activity_id JOIN app_user AS author ON author.id = log.created_by WHERE log.child_id = $1 ORDER BY log.event_time DESC`,
      [request.params.childId],
    ),
    pool.query(
      "SELECT title, kind, scheduled_for, interval_minutes FROM reminder WHERE child_id = $1 AND completed_at IS NULL ORDER BY scheduled_for NULLS LAST",
      [request.params.childId],
    ),
  ]);
  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const logRows = logs.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.event_time.toISOString())}</td><td>${escapeHtml(JSON.stringify({ ...row.field_values, ...(row.feeding_portions.length ? { portions: row.feeding_portions } : {}) }))}</td><td>${escapeHtml(row.note)}</td><td>${escapeHtml(row.display_name)}</td></tr>`,
    )
    .join("");
  const reminderRows = reminders.rows
    .map(
      (row) =>
        `<tr><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.kind === "one_time" ? row.scheduled_for?.toISOString() : `Every ${row.interval_minutes} minutes after activity`)}</td></tr>`,
    )
    .join("");
  response
    .type("html")
    .send(
      `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(child.rows[0]?.name ?? "Care")} care report</title><style>body{font:14px system-ui;margin:40px;color:#27211d}h1{margin-bottom:2px}p{color:#655d56}table{width:100%;border-collapse:collapse;margin:26px 0}th,td{border-bottom:1px solid #ddd3c8;padding:8px;text-align:left;vertical-align:top}th{background:#f8f2eb}@media print{button{display:none}body{margin:18px}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>${escapeHtml(child.rows[0]?.name ?? "Child")} care report</h1><p>Generated ${new Date().toLocaleString()}</p><h2>Recorded care</h2><table><thead><tr><th>Activity</th><th>When</th><th>Details</th><th>Note</th><th>Logged by</th></tr></thead><tbody>${logRows || "<tr><td colspan='5'>No records</td></tr>"}</tbody></table><h2>Upcoming care</h2><table><thead><tr><th>Reminder</th><th>Schedule</th></tr></thead><tbody>${reminderRows || "<tr><td colspan='2'>No upcoming reminders</td></tr>"}</tbody></table></body></html>`,
    );
});
app.get(
  "/api/children/:childId/insights/:activityId",
  async (request, response) => {
    const session = requireSession(request, response);
    if (!session) return;
    const { childId, activityId } = request.params;
    const access = await membership(childId, session.userId);
    if (access.rowCount !== 1) {
      response.status(403).json({ error: "Child access is required" });
      return;
    }
    const [logs, gaps] = await Promise.all([
      pool.query(
        "SELECT event_time FROM activity_log WHERE child_id = $1 AND activity_id = $2 ORDER BY event_time",
        [childId, activityId],
      ),
      pool.query(
        "SELECT starts_at, ends_at FROM care_gap WHERE child_id = $1",
        [childId],
      ),
    ]);
    const intervals = usableIntervals(
      logs.rows.map((row) => ({ eventTime: row.event_time.toISOString() })),
      gaps.rows.map((row) => ({
        startsAt: row.starts_at.toISOString(),
        endsAt: row.ends_at.toISOString(),
      })),
    );
    response.json({ intervals });
  },
);
io.use((socket, next) => {
  const cookies = Object.fromEntries(
    (socket.handshake.headers.cookie ?? "")
      .split("; ")
      .filter(Boolean)
      .map((item) => item.split("=")),
  );
  try {
    socket.data.session = jwt.verify(
      cookies.nurture_session,
      secret,
    ) as Session;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});
io.on("connection", (socket) => {
  socket.on("child:join", async (childId: string) => {
    const access = await membership(childId, socket.data.session.userId);
    if (access.rowCount === 1) socket.join(childRoom(childId));
  });
});
httpServer.listen(port, () => console.log(`Nurture API listening on ${port}`));

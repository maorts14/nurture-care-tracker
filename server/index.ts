import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { createServer } from "node:http";
import { Pool } from "pg";
import { Server } from "socket.io";
import { usableIntervals } from "./analytics.js";

type Session = { userId: string };
const port = Number(process.env.PORT ?? 3001);
const secret = process.env.JWT_SECRET ?? "development-only-secret-change-me";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: process.env.WEB_ORIGIN ?? "http://localhost:8080", credentials: true } });

app.use(cors({ origin: process.env.WEB_ORIGIN ?? "http://localhost:8080", credentials: true }));
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
  try { return jwt.verify(token, secret) as Session; } catch { return null; }
}
function requireSession(request: Request, response: Response): Session | null {
  const session = sessionFrom(request);
  if (!session) response.status(401).json({ error: "Sign in is required" });
  return session;
}
async function membership(childId: string, userId: string) {
  return pool.query<{ role: "owner" | "caregiver" | "viewer" }>("SELECT role FROM child_membership WHERE child_id = $1 AND user_id = $2", [childId, userId]);
}
function childRoom(childId: string) { return `child:${childId}`; }

app.post("/api/auth/sign-in", async (request, response) => {
  const { email, password } = request.body as { email: string; password: string };
  const result = await pool.query<{ id: string; password_hash: string; display_name: string; locale: string }>("SELECT id, password_hash, display_name, locale FROM app_user WHERE email = $1", [email]);
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) { response.status(401).json({ error: "Email or password is incorrect" }); return; }
  const token = jwt.sign({ userId: user.id }, secret, { expiresIn: "30d" });
  response.cookie("nurture_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 2_592_000_000 });
  response.json({ id: user.id, name: user.display_name, locale: user.locale });
});
app.post("/api/auth/sign-out", (_request, response) => { response.clearCookie("nurture_session"); response.status(204).end(); });
app.post("/api/auth/register", async (request, response) => {
  const { email, password, displayName, locale } = request.body as { email: string; password: string; displayName: string; locale: "en" | "he" };
  if (!email || !password || !displayName) { response.status(400).json({ error: "Name, email, and password are required" }); return; }
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = await pool.query<{ id: string; email: string; display_name: string; locale: string }>("INSERT INTO app_user (email, password_hash, display_name, locale, email_verified_at) VALUES ($1, $2, $3, $4, now()) RETURNING id, email, display_name, locale", [email, passwordHash, displayName, locale]);
    const user = result.rows[0]; const token = jwt.sign({ userId: user.id }, secret, { expiresIn: "30d" });
    response.cookie("nurture_session", token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 2_592_000_000 }); response.status(201).json(user);
  } catch { response.status(409).json({ error: "An account already uses that email" }); }
});
app.get("/api/auth/google", (request, response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID; const appUrl = process.env.APP_URL ?? "http://localhost:8080";
  if (!clientId) { response.status(503).json({ error: "Google login needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server environment" }); return; }
  const state = jwt.sign({ returnTo: "/" }, secret, { expiresIn: "10m" });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth"); url.searchParams.set("client_id", clientId); url.searchParams.set("redirect_uri", `${appUrl}/api/auth/google/callback`); url.searchParams.set("response_type", "code"); url.searchParams.set("scope", "openid email profile"); url.searchParams.set("state", state); response.redirect(url.toString());
});
app.get("/api/auth/google/callback", async (request, response) => {
  const { code } = request.query as { code?: string }; const appUrl = process.env.APP_URL ?? "http://localhost:8080";
  if (!code || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) { response.status(400).send("Google login is not configured"); return; }
  const tokenResult = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: `${appUrl}/api/auth/google/callback`, grant_type: "authorization_code" }) });
  const tokenData = await tokenResult.json() as { access_token: string }; const profileResult = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${tokenData.access_token}` } }); const profile = await profileResult.json() as { email: string; name: string };
  const result = await pool.query<{ id: string }>("INSERT INTO app_user (email, password_hash, display_name, email_verified_at) VALUES ($1, '', $2, now()) ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name RETURNING id", [profile.email, profile.name]);
  response.cookie("nurture_session", jwt.sign({ userId: result.rows[0].id }, secret, { expiresIn: "30d" }), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 2_592_000_000 }); response.redirect("/");
});

app.get("/api/me", async (request, response) => {
  const session = requireSession(request, response); if (!session) return;
  const result = await pool.query("SELECT id, email, display_name, locale FROM app_user WHERE id = $1", [session.userId]);
  response.json(result.rows[0]);
});
app.get("/api/children", async (request, response) => {
  const session = requireSession(request, response); if (!session) return;
  const result = await pool.query(`SELECT child.id, child.name, child.timezone, child.birth_date, membership.role FROM child_membership AS membership JOIN child ON child.id = membership.child_id WHERE membership.user_id = $1 AND child.archived_at IS NULL ORDER BY child.created_at`, [session.userId]);
  response.json(result.rows);
});
app.post("/api/children", async (request, response) => {
  const session = requireSession(request, response); if (!session) return;
  const { name, timezone, birthDate } = request.body as { name: string; timezone: string; birthDate?: string };
  if (!name || !timezone) { response.status(400).json({ error: "Child name and timezone are required" }); return; }
  const client = await pool.connect();
  try { await client.query("BEGIN"); const child = await client.query<{ id: string }>("INSERT INTO child (name, timezone, birth_date) VALUES ($1, $2, $3) RETURNING id", [name, timezone, birthDate ?? null]); const id = child.rows[0].id; await client.query("INSERT INTO child_membership (child_id, user_id, role) VALUES ($1, $2, 'owner')", [id, session.userId]); await client.query("INSERT INTO activity_definition (child_id, name, kind, color) VALUES ($1, 'Feeding', 'feeding', '#f3654b'), ($1, 'Diaper change', 'diaper', '#526cdb')", [id]); await client.query("COMMIT"); response.status(201).json({ id }); } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});
app.put("/api/children/:childId", async (request, response) => {
  const session = requireSession(request, response); if (!session) return;
  const { name } = request.body as { name: string };
  if (!name.trim()) { response.status(400).json({ error: "Child name is required" }); return; }
  const updated = await pool.query("UPDATE child SET name = $1 WHERE id = $2 AND EXISTS (SELECT 1 FROM child_membership WHERE child_id = child.id AND user_id = $3 AND role = 'owner') RETURNING id", [name.trim(), request.params.childId, session.userId]);
  if (updated.rowCount !== 1) { response.status(403).json({ error: "Only a child owner can rename this profile" }); return; }
  io.to(childRoom(request.params.childId)).emit("timeline:changed");
  response.status(204).end();
});
app.put("/api/me/locale", async (request, response) => { const session = requireSession(request, response); if (!session) return; const { locale } = request.body as { locale: "en" | "he" }; if (locale !== "en" && locale !== "he") { response.status(400).json({ error: "Unsupported locale" }); return; } await pool.query("UPDATE app_user SET locale = $1 WHERE id = $2", [locale, session.userId]); response.status(204).end(); });
app.get("/api/children/:childId/dashboard", async (request, response) => {
  const session = requireSession(request, response); if (!session) return;
  const { childId } = request.params; const access = await membership(childId, session.userId);
  if (access.rowCount !== 1) { response.status(403).json({ error: "Child access is required" }); return; }
  const [timeline, activities, fields, reminders, gaps] = await Promise.all([
    pool.query(`SELECT log.id, log.activity_id, log.event_time, log.event_timezone, log.field_values, log.note, log.created_at, log.created_by AS created_by_id, activity.name AS activity_name, activity.kind, activity.color, author.display_name AS created_by FROM activity_log AS log JOIN activity_definition AS activity ON activity.id = log.activity_id JOIN app_user AS author ON author.id = log.created_by WHERE log.child_id = $1 ORDER BY log.event_time DESC LIMIT 100`, [childId]),
    pool.query("SELECT id, name, kind, color FROM activity_definition WHERE child_id = $1 AND archived_at IS NULL ORDER BY created_at", [childId]),
    pool.query(`SELECT field.id, field.activity_id, field.field_key, field.label, field.field_type, field.unit, field.options, field.dashboard_metrics FROM activity_field_definition AS field JOIN activity_definition AS activity ON activity.id = field.activity_id WHERE activity.child_id = $1 AND field.archived_at IS NULL ORDER BY field.id`, [childId]),
    pool.query(`SELECT reminder.*, activity.name AS activity_name, activity.color FROM reminder LEFT JOIN activity_definition AS activity ON activity.id = reminder.activity_id WHERE reminder.child_id = $1 AND reminder.completed_at IS NULL ORDER BY reminder.scheduled_for NULLS LAST`, [childId]),
    pool.query("SELECT starts_at, ends_at, reason FROM care_gap WHERE child_id = $1 ORDER BY starts_at DESC", [childId]),
  ]);
  const activitiesWithFields = activities.rows.map((activity) => ({ ...activity, fields: fields.rows.filter((field) => field.activity_id === activity.id) }));
  const gapWindows = gaps.rows.map((gap) => ({ startsAt: gap.starts_at.toISOString(), endsAt: gap.ends_at.toISOString() }));
  const analytics = activitiesWithFields.map((activity: { id: string; fields: { field_key: string; label: string; unit?: string; field_type: string }[] }) => {
    const logs = timeline.rows.filter((log) => log.activity_id === activity.id);
    const intervals = usableIntervals(logs.map((log) => ({ eventTime: log.event_time.toISOString() })), gapWindows);
    const hours = intervals.map((value) => value / 3_600_000).sort((left, right) => left - right);
    const averageHours = hours.length ? hours.reduce((sum, value) => sum + value, 0) / hours.length : null;
    const medianHours = hours.length ? hours[Math.floor(hours.length / 2)] : null;
    return { activity_id: activity.id, count: logs.length, average_hours: averageHours, median_hours: medianHours, interval_warning: averageHours !== null && medianHours !== null && Math.abs(averageHours - medianHours) > medianHours * 0.25, fields: activity.fields.filter((field) => field.field_type === "number" || field.field_type === "duration").map((field) => { const values = logs.map((log) => Number(log.field_values[field.field_key])).filter(Number.isFinite); return { key: field.field_key, label: field.label, unit: field.unit, count: values.length, average: values.length ? values.reduce((sum: number, value: number) => sum + value, 0) / values.length : null }; }) };
  });
  response.json({ role: access.rows[0].role, timeline: timeline.rows, activities: activitiesWithFields, reminders: reminders.rows, gaps: gaps.rows, analytics });
});
app.post("/api/children/:childId/logs", async (request, response) => {
  const session = requireSession(request, response); if (!session) return;
  const { childId } = request.params;
  const { activityId, eventTime, eventTimezone, fieldValues, note } = request.body as { activityId: string; eventTime: string; eventTimezone: string; fieldValues: Record<string, unknown>; note?: string };
  if (!activityId || !eventTime || !eventTimezone) { response.status(400).json({ error: "Activity and event time are required" }); return; }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const access = await client.query(`SELECT membership.role FROM child_membership AS membership JOIN activity_definition AS activity ON activity.id = $2 AND activity.child_id = membership.child_id WHERE membership.child_id = $1 AND membership.user_id = $3 AND membership.role IN ('owner', 'caregiver') AND activity.archived_at IS NULL`, [childId, activityId, session.userId]);
    if (access.rowCount !== 1) { await client.query("ROLLBACK"); response.status(403).json({ error: "You cannot log this activity" }); return; }
    const inserted = await client.query(`INSERT INTO activity_log (child_id, activity_id, event_time, event_timezone, field_values, note, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, activity_id, event_time, event_timezone, field_values, note, created_at`, [childId, activityId, eventTime, eventTimezone, fieldValues, note ?? null, session.userId]);
    await client.query("COMMIT"); io.to(childRoom(childId)).emit("timeline:changed"); response.status(201).json(inserted.rows[0]);
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});
app.delete("/api/logs/:logId", async (request, response) => {
  const session = requireSession(request, response); if (!session) return;
  const deleted = await pool.query<{ child_id: string }>(`DELETE FROM activity_log AS log USING child_membership AS membership WHERE log.id = $1 AND membership.child_id = log.child_id AND membership.user_id = $2 AND (membership.role = 'owner' OR log.created_by = $2) RETURNING log.child_id`, [request.params.logId, session.userId]);
  if (deleted.rowCount !== 1) { response.status(403).json({ error: "Only the log creator or owner can delete this record" }); return; }
  io.to(childRoom(deleted.rows[0].child_id)).emit("timeline:changed"); response.status(204).end();
});
app.post("/api/children/:childId/gaps", async (request, response) => {
  const session = requireSession(request, response); if (!session) return;
  const { childId } = request.params; const { startsAt, endsAt, reason } = request.body as { startsAt: string; endsAt: string; reason?: string };
  const access = await membership(childId, session.userId);
  if (access.rows[0]?.role === "viewer") { response.status(403).json({ error: "Caregiver access is required" }); return; }
  const inserted = await pool.query("INSERT INTO care_gap (child_id, starts_at, ends_at, reason, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *", [childId, startsAt, endsAt, reason ?? null, session.userId]);
  io.to(childRoom(childId)).emit("timeline:changed"); response.status(201).json(inserted.rows[0]);
});
app.post("/api/children/:childId/invitations", async (request, response) => {
  const session = requireSession(request, response); if (!session) return; const { childId } = request.params; const { email, role } = request.body as { email: string; role: "caregiver" | "viewer" };
  const access = await membership(childId, session.userId); if (access.rows[0]?.role !== "owner") { response.status(403).json({ error: "Owner access is required" }); return; }
  const invite = await pool.query<{ token: string }>("INSERT INTO child_invitation (child_id, email, role, invited_by) VALUES ($1, $2, $3, $4) RETURNING token", [childId, email, role, session.userId]);
  response.status(201).json({ token: invite.rows[0].token, acceptUrl: `/?invite=${invite.rows[0].token}` });
});
app.post("/api/invitations/:token/accept", async (request, response) => {
  const session = requireSession(request, response); if (!session) return; const { token } = request.params;
  const invite = await pool.query<{ child_id: string; role: "caregiver" | "viewer" }>(`SELECT invitation.child_id, invitation.role FROM child_invitation AS invitation JOIN app_user ON app_user.email = invitation.email WHERE invitation.token = $1 AND invitation.accepted_at IS NULL AND invitation.expires_at > now() AND app_user.id = $2`, [token, session.userId]);
  if (invite.rowCount !== 1) { response.status(404).json({ error: "This invitation is not available for your account" }); return; }
  await pool.query("INSERT INTO child_membership (child_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT (child_id, user_id) DO UPDATE SET role = EXCLUDED.role", [invite.rows[0].child_id, session.userId, invite.rows[0].role]); await pool.query("UPDATE child_invitation SET accepted_at = now() WHERE token = $1", [token]); response.status(204).end();
});
app.post("/api/children/:childId/activities", async (request, response) => {
  const session = requireSession(request, response); if (!session) return; const { childId } = request.params; const { name, color, fields } = request.body as { name: string; color: string; fields: { key: string; label: string; type: string; unit?: string; metrics?: string[] }[] };
  const access = await membership(childId, session.userId); if (access.rows[0]?.role !== "owner") { response.status(403).json({ error: "Owner access is required" }); return; }
  const client = await pool.connect(); try { await client.query("BEGIN"); const activity = await client.query<{ id: string }>("INSERT INTO activity_definition (child_id, name, kind, color) VALUES ($1, $2, 'custom', $3) RETURNING id", [childId, name, color]); for (const field of fields) await client.query("INSERT INTO activity_field_definition (activity_id, field_key, label, field_type, unit, dashboard_metrics) VALUES ($1, $2, $3, $4, $5, $6::jsonb)", [activity.rows[0].id, field.key, field.label, field.type, field.unit ?? null, JSON.stringify(field.metrics ?? [])]); await client.query("COMMIT"); io.to(childRoom(childId)).emit("timeline:changed"); response.status(201).json(activity.rows[0]); } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
});
app.post("/api/activities/:activityId/fields", async (request, response) => {
  const session = requireSession(request, response); if (!session) return;
  const { fieldKey, label, fieldType, unit, options, metrics } = request.body as { fieldKey: string; label: string; fieldType: string; unit?: string; options?: string[]; metrics?: string[] };
  if (!fieldKey || !label || !["text", "number", "boolean", "select", "duration"].includes(fieldType)) { response.status(400).json({ error: "A valid field name and type are required" }); return; }
  const activity = await pool.query<{ child_id: string }>(`SELECT activity.child_id FROM activity_definition AS activity JOIN child_membership AS membership ON membership.child_id = activity.child_id WHERE activity.id = $1 AND membership.user_id = $2 AND membership.role = 'owner'`, [request.params.activityId, session.userId]);
  if (activity.rowCount !== 1) { response.status(403).json({ error: "Owner access is required" }); return; }
  await pool.query("INSERT INTO activity_field_definition (activity_id, field_key, label, field_type, unit, options, dashboard_metrics) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)", [request.params.activityId, fieldKey, label, fieldType, unit ?? null, JSON.stringify(options ?? []), JSON.stringify(metrics ?? [])]);
  io.to(childRoom(activity.rows[0].child_id)).emit("timeline:changed"); response.status(201).end();
});
app.delete("/api/activities/:activityId", async (request, response) => {
  const session = requireSession(request, response); if (!session) return;
  const archived = await pool.query<{ child_id: string }>(`UPDATE activity_definition AS activity SET archived_at = now() FROM child_membership AS membership WHERE activity.id = $1 AND membership.child_id = activity.child_id AND membership.user_id = $2 AND membership.role = 'owner' RETURNING activity.child_id`, [request.params.activityId, session.userId]);
  if (archived.rowCount !== 1) { response.status(403).json({ error: "Owner access is required" }); return; }
  io.to(childRoom(archived.rows[0].child_id)).emit("timeline:changed"); response.status(204).end();
});
app.post("/api/children/:childId/reminders", async (request, response) => {
  const session = requireSession(request, response); if (!session) return; const { childId } = request.params; const { title, activityId, kind, intervalMinutes, scheduledFor } = request.body as { title: string; activityId?: string; kind: "interval" | "one_time"; intervalMinutes?: number; scheduledFor?: string };
  const access = await membership(childId, session.userId); if (access.rows[0]?.role !== "owner") { response.status(403).json({ error: "Owner access is required" }); return; }
  const inserted = await pool.query("INSERT INTO reminder (child_id, activity_id, kind, interval_minutes, scheduled_for, title) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *", [childId, activityId ?? null, kind, intervalMinutes ?? null, scheduledFor ?? null, title]); io.to(childRoom(childId)).emit("timeline:changed"); response.status(201).json(inserted.rows[0]);
});
app.post("/api/reminders/:reminderId/complete", async (request, response) => { const session = requireSession(request, response); if (!session) return; const result = await pool.query("UPDATE reminder SET completed_at = now() WHERE id = $1 AND child_id IN (SELECT child_id FROM child_membership WHERE user_id = $2) RETURNING child_id", [request.params.reminderId, session.userId]); if (result.rowCount !== 1) { response.status(404).json({ error: "Reminder not found" }); return; } io.to(childRoom(result.rows[0].child_id)).emit("timeline:changed"); response.status(204).end(); });
app.put("/api/reminders/:reminderId", async (request, response) => { const session = requireSession(request, response); if (!session) return; const { title, activityId, kind, intervalMinutes, scheduledFor } = request.body as { title: string; activityId?: string | null; kind: "interval" | "one_time"; intervalMinutes?: number | null; scheduledFor?: string | null }; if (!title || !["interval", "one_time"].includes(kind) || (kind === "interval" && (!intervalMinutes || intervalMinutes < 1)) || (kind === "one_time" && !scheduledFor)) { response.status(400).json({ error: "Provide a valid reminder title and schedule" }); return; } const updated = await pool.query<{ child_id: string }>("UPDATE reminder SET title = $1, activity_id = $2, kind = $3, interval_minutes = $4, scheduled_for = $5 WHERE id = $6 AND child_id IN (SELECT child_id FROM child_membership WHERE user_id = $7 AND role = 'owner') RETURNING child_id", [title, activityId ?? null, kind, kind === "interval" ? intervalMinutes : null, kind === "one_time" ? scheduledFor : null, request.params.reminderId, session.userId]); if (updated.rowCount !== 1) { response.status(404).json({ error: "Reminder not found" }); return; } io.to(childRoom(updated.rows[0].child_id)).emit("timeline:changed"); response.status(204).end(); });
app.delete("/api/reminders/:reminderId", async (request, response) => { const session = requireSession(request, response); if (!session) return; const result = await pool.query("DELETE FROM reminder WHERE id = $1 AND child_id IN (SELECT child_id FROM child_membership WHERE user_id = $2 AND role = 'owner') RETURNING child_id", [request.params.reminderId, session.userId]); if (result.rowCount !== 1) { response.status(404).json({ error: "Reminder not found" }); return; } io.to(childRoom(result.rows[0].child_id)).emit("timeline:changed"); response.status(204).end(); });
app.get("/api/children/:childId/notes", async (request, response) => { const session = requireSession(request, response); if (!session) return; const access = await membership(request.params.childId, session.userId); if (access.rowCount !== 1) { response.status(403).json({ error: "Child access is required" }); return; } const notes = await pool.query(`SELECT note.*, author.display_name AS created_by_name FROM child_note AS note JOIN app_user AS author ON author.id = note.created_by WHERE note.child_id = $1 AND (note.visibility = 'shared' OR note.created_by = $2) ORDER BY note.created_at DESC`, [request.params.childId, session.userId]); response.json(notes.rows); });
app.post("/api/children/:childId/notes", async (request, response) => { const session = requireSession(request, response); if (!session) return; const { body, visibility } = request.body as { body: string; visibility: "private" | "shared" }; const access = await membership(request.params.childId, session.userId); if (access.rows[0]?.role === "viewer") { response.status(403).json({ error: "Caregiver access is required" }); return; } const note = await pool.query("INSERT INTO child_note (child_id, body, visibility, created_by) VALUES ($1, $2, $3, $4) RETURNING *", [request.params.childId, body, visibility, session.userId]); io.to(childRoom(request.params.childId)).emit("notes:changed"); response.status(201).json(note.rows[0]); });
app.put("/api/notes/:noteId", async (request, response) => { const session = requireSession(request, response); if (!session) return; const { body, visibility } = request.body as { body: string; visibility: "private" | "shared" }; const updated = await pool.query<{ child_id: string }>("UPDATE child_note SET body = $1, visibility = $2 WHERE id = $3 AND created_by = $4 RETURNING child_id", [body, visibility, request.params.noteId, session.userId]); if (updated.rowCount !== 1) { response.status(403).json({ error: "Only the note creator can edit this note" }); return; } io.to(childRoom(updated.rows[0].child_id)).emit("notes:changed"); response.status(204).end(); });
app.delete("/api/notes/:noteId", async (request, response) => { const session = requireSession(request, response); if (!session) return; const deleted = await pool.query<{ child_id: string }>("DELETE FROM child_note WHERE id = $1 AND created_by = $2 RETURNING child_id", [request.params.noteId, session.userId]); if (deleted.rowCount !== 1) { response.status(403).json({ error: "Only the note creator can delete this note" }); return; } io.to(childRoom(deleted.rows[0].child_id)).emit("notes:changed"); response.status(204).end(); });
app.get("/api/logs/:logId/comments", async (request, response) => { const session = requireSession(request, response); if (!session) return; const comments = await pool.query(`SELECT comment.*, author.display_name AS created_by_name FROM log_comment AS comment JOIN app_user AS author ON author.id = comment.created_by JOIN activity_log AS log ON log.id = comment.log_id JOIN child_membership AS membership ON membership.child_id = log.child_id WHERE comment.log_id = $1 AND membership.user_id = $2 ORDER BY comment.created_at`, [request.params.logId, session.userId]); response.json(comments.rows); });
app.post("/api/logs/:logId/comments", async (request, response) => { const session = requireSession(request, response); if (!session) return; const { body } = request.body as { body: string }; const comment = await pool.query(`INSERT INTO log_comment (log_id, body, created_by) SELECT log.id, $2, $3 FROM activity_log AS log JOIN child_membership AS membership ON membership.child_id = log.child_id WHERE log.id = $1 AND membership.user_id = $3 AND membership.role IN ('owner', 'caregiver') RETURNING *`, [request.params.logId, body, session.userId]); if (comment.rowCount !== 1) { response.status(403).json({ error: "You cannot comment on this activity" }); return; } response.status(201).json(comment.rows[0]); });
app.put("/api/comments/:commentId", async (request, response) => { const session = requireSession(request, response); if (!session) return; const { body } = request.body as { body: string }; const updated = await pool.query("UPDATE log_comment AS comment SET body = $1, updated_at = now() WHERE comment.id = $2 AND comment.created_by = $3 RETURNING id", [body, request.params.commentId, session.userId]); if (updated.rowCount !== 1) { response.status(403).json({ error: "Only the comment creator can edit this comment" }); return; } response.status(204).end(); });
app.delete("/api/comments/:commentId", async (request, response) => { const session = requireSession(request, response); if (!session) return; const deleted = await pool.query("DELETE FROM log_comment AS comment WHERE comment.id = $1 AND comment.created_by = $2 RETURNING id", [request.params.commentId, session.userId]); if (deleted.rowCount !== 1) { response.status(403).json({ error: "Only the comment creator can delete this comment" }); return; } response.status(204).end(); });
app.get("/api/children/:childId/export.csv", async (request, response) => { const session = requireSession(request, response); if (!session) return; const access = await membership(request.params.childId, session.userId); if (access.rowCount !== 1) { response.status(403).json({ error: "Child access is required" }); return; } const [logs, reminders] = await Promise.all([pool.query(`SELECT activity.name, log.event_time, log.field_values, log.note, author.display_name FROM activity_log AS log JOIN activity_definition AS activity ON activity.id = log.activity_id JOIN app_user AS author ON author.id = log.created_by WHERE log.child_id = $1 ORDER BY log.event_time DESC`, [request.params.childId]), pool.query("SELECT title, kind, scheduled_for, interval_minutes FROM reminder WHERE child_id = $1 AND completed_at IS NULL", [request.params.childId])]); const escape = (value: unknown) => `\"${String(value ?? "").replaceAll('\"', '\"\"')}\"`; const rows = ["record_type,activity,event_time,values,note,created_by", ...logs.rows.map((row) => ["logged", row.name, row.event_time.toISOString(), JSON.stringify(row.field_values), row.note, row.display_name].map(escape).join(",")), ...reminders.rows.map((row) => ["upcoming", row.title, row.scheduled_for?.toISOString() ?? `after ${row.interval_minutes} minutes`, row.kind, "", ""].map(escape).join(","))]; response.setHeader("Content-Type", "text/csv"); response.setHeader("Content-Disposition", "attachment; filename=care-report.csv"); response.send(rows.join("\n")); });
app.get("/api/children/:childId/export.report", async (request, response) => { const session = requireSession(request, response); if (!session) return; const access = await membership(request.params.childId, session.userId); if (access.rowCount !== 1) { response.status(403).send("Child access is required"); return; } const [child, logs, reminders] = await Promise.all([pool.query("SELECT name FROM child WHERE id = $1", [request.params.childId]), pool.query(`SELECT activity.name, log.event_time, log.field_values, log.note, author.display_name FROM activity_log AS log JOIN activity_definition AS activity ON activity.id = log.activity_id JOIN app_user AS author ON author.id = log.created_by WHERE log.child_id = $1 ORDER BY log.event_time DESC`, [request.params.childId]), pool.query("SELECT title, kind, scheduled_for, interval_minutes FROM reminder WHERE child_id = $1 AND completed_at IS NULL ORDER BY scheduled_for NULLS LAST", [request.params.childId])]); const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); const logRows = logs.rows.map((row) => `<tr><td>${escapeHtml(row.name)}</td><td>${escapeHtml(row.event_time.toISOString())}</td><td>${escapeHtml(JSON.stringify(row.field_values))}</td><td>${escapeHtml(row.note)}</td><td>${escapeHtml(row.display_name)}</td></tr>`).join(""); const reminderRows = reminders.rows.map((row) => `<tr><td>${escapeHtml(row.title)}</td><td>${escapeHtml(row.kind === "one_time" ? row.scheduled_for?.toISOString() : `Every ${row.interval_minutes} minutes after activity`)}</td></tr>`).join(""); response.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(child.rows[0]?.name ?? "Care")} care report</title><style>body{font:14px system-ui;margin:40px;color:#27211d}h1{margin-bottom:2px}p{color:#655d56}table{width:100%;border-collapse:collapse;margin:26px 0}th,td{border-bottom:1px solid #ddd3c8;padding:8px;text-align:left;vertical-align:top}th{background:#f8f2eb}@media print{button{display:none}body{margin:18px}}</style></head><body><button onclick="window.print()">Print / Save as PDF</button><h1>${escapeHtml(child.rows[0]?.name ?? "Child")} care report</h1><p>Generated ${new Date().toLocaleString()}</p><h2>Recorded care</h2><table><thead><tr><th>Activity</th><th>When</th><th>Details</th><th>Note</th><th>Logged by</th></tr></thead><tbody>${logRows || "<tr><td colspan='5'>No records</td></tr>"}</tbody></table><h2>Upcoming care</h2><table><thead><tr><th>Reminder</th><th>Schedule</th></tr></thead><tbody>${reminderRows || "<tr><td colspan='2'>No upcoming reminders</td></tr>"}</tbody></table></body></html>`); });
app.get("/api/children/:childId/insights/:activityId", async (request, response) => {
  const session = requireSession(request, response); if (!session) return;
  const { childId, activityId } = request.params; const access = await membership(childId, session.userId);
  if (access.rowCount !== 1) { response.status(403).json({ error: "Child access is required" }); return; }
  const [logs, gaps] = await Promise.all([pool.query("SELECT event_time FROM activity_log WHERE child_id = $1 AND activity_id = $2 ORDER BY event_time", [childId, activityId]), pool.query("SELECT starts_at, ends_at FROM care_gap WHERE child_id = $1", [childId])]);
  const intervals = usableIntervals(logs.rows.map((row) => ({ eventTime: row.event_time.toISOString() })), gaps.rows.map((row) => ({ startsAt: row.starts_at.toISOString(), endsAt: row.ends_at.toISOString() })));
  response.json({ intervals });
});
io.use((socket, next) => {
  const cookies = Object.fromEntries((socket.handshake.headers.cookie ?? "").split("; ").filter(Boolean).map((item) => item.split("=")));
  try { socket.data.session = jwt.verify(cookies.nurture_session, secret) as Session; next(); } catch { next(new Error("unauthorized")); }
});
io.on("connection", (socket) => { socket.on("child:join", async (childId: string) => { const access = await membership(childId, socket.data.session.userId); if (access.rowCount === 1) socket.join(childRoom(childId)); }); });
httpServer.listen(port, () => console.log(`Nurture API listening on ${port}`));

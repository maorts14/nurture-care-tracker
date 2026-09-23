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
const customActivityIcons = new Set([
  "utensils", "droplets", "heart-pulse", "stethoscope", "pill", "syringe", "thermometer", "bath", "bed", "baby",
  "milk", "apple", "sun", "moon", "footprints", "book", "music", "sparkles",
]);
type ActivityFieldInput = {
  id?: string;
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "duration";
  unit?: string | null;
  options?: string[];
  booleanTrueLabel?: string | null;
  booleanFalseLabel?: string | null;
  metrics?: string[];
};
function activityFieldConfiguration(field: ActivityFieldInput) {
  if (
    !field.key ||
    !field.label.trim() ||
    !["text", "number", "boolean", "select", "duration"].includes(field.type) ||
    (field.type === "select" && !field.options?.length)
  )
    return null;
  return {
    key: field.key,
    label: field.label.trim(),
    type: field.type,
    unit: field.type === "number" || field.type === "duration" ? field.unit?.trim() || null : null,
    options: field.type === "select" ? field.options : [],
    booleanTrueLabel: field.type === "boolean" ? field.booleanTrueLabel?.trim() || null : null,
    booleanFalseLabel: field.type === "boolean" ? field.booleanFalseLabel?.trim() || null : null,
    metrics: field.metrics ?? [],
  };
}
const port = Number(process.env.PORT ?? 3001);
const secret = process.env.JWT_SECRET ?? "development-only-secret-change-me";
const version = process.env.APP_VERSION ?? "development";
const commit = process.env.APP_COMMIT ?? "unknown";
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
    response.json({ status: "ok", version, commit });
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
  return pool.query<{ role: "owner" | "care_manager" | "caregiver" | "viewer" }>(
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
  const returnTo =
    typeof request.query.returnTo === "string" &&
    request.query.returnTo.startsWith("/") &&
    !request.query.returnTo.startsWith("//")
      ? request.query.returnTo
      : "/";
  if (!clientId) {
    response.status(503).json({
      error:
        "Google login needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server environment",
    });
    return;
  }
  const state = jwt.sign({ returnTo }, secret, { expiresIn: "10m" });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${appUrl}/api/auth/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  response.redirect(url.toString());
});
app.get("/api/auth/google/callback", async (request, response) => {
  const { code, state } = request.query as { code?: string; state?: string };
  const appUrl = process.env.APP_URL ?? "http://localhost:8080";
  if (
    !code ||
    !process.env.GOOGLE_CLIENT_ID ||
    !process.env.GOOGLE_CLIENT_SECRET
  ) {
    response.status(400).send("Google login is not configured");
    return;
  }
  let returnTo = "/";
  if (state) {
    try {
      const payload = jwt.verify(state, secret) as { returnTo: string };
      if (!payload.returnTo.startsWith("/") || payload.returnTo.startsWith("//")) {
        response.status(400).send("Google sign-in could not be validated");
        return;
      }
      returnTo = payload.returnTo;
    } catch {
      response.status(400).send("Google sign-in could not be validated");
      return;
    }
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
  response.redirect(returnTo);
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
app.get("/api/me/export", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const [profile, memberships, activityLogs, careGaps, notes, comments, invitations] =
    await Promise.all([
      pool.query(
        "SELECT id, email, display_name, locale, email_verified_at, created_at FROM app_user WHERE id = $1",
        [session.userId],
      ),
      pool.query(
        `SELECT child.id AS child_id, child.name AS child_name, child.timezone, child.birth_date, membership.role, membership.joined_at
         FROM child_membership AS membership
         JOIN child ON child.id = membership.child_id
         WHERE membership.user_id = $1
         ORDER BY membership.joined_at`,
        [session.userId],
      ),
      pool.query(
        `SELECT log.id, log.child_id, child.name AS child_name, activity.name AS activity_name, log.event_time, log.event_timezone, log.field_values, log.note, log.created_at
         FROM activity_log AS log
         JOIN child ON child.id = log.child_id
         JOIN activity_definition AS activity ON activity.id = log.activity_id
         WHERE log.created_by = $1
         ORDER BY log.created_at`,
        [session.userId],
      ),
      pool.query(
        "SELECT id, child_id, starts_at, ends_at, reason, created_at FROM care_gap WHERE created_by = $1 ORDER BY created_at",
        [session.userId],
      ),
      pool.query(
        "SELECT id, child_id, body, visibility, created_at FROM child_note WHERE created_by = $1 ORDER BY created_at",
        [session.userId],
      ),
      pool.query(
        `SELECT comment.id, comment.log_id, log.child_id, comment.body, comment.created_at, comment.updated_at
         FROM log_comment AS comment
         JOIN activity_log AS log ON log.id = comment.log_id
         WHERE comment.created_by = $1
         ORDER BY comment.created_at`,
        [session.userId],
      ),
      pool.query(
        "SELECT id, child_id, email, role, accepted_at, expires_at, created_at FROM child_invitation WHERE invited_by = $1 ORDER BY created_at",
        [session.userId],
      ),
    ]);
  response
    .attachment("feedme-account-data.json")
    .json({
      exported_at: new Date().toISOString(),
      profile: profile.rows[0],
      memberships: memberships.rows,
      activity_logs_created_by_you: activityLogs.rows,
      care_gaps_created_by_you: careGaps.rows,
      notes_created_by_you: notes.rows,
      comments_created_by_you: comments.rows,
      invitations_created_by_you: invitations.rows,
    });
});
app.delete("/api/me", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { emailConfirmation } = request.body as { emailConfirmation: string };
  const client = await pool.connect();
  const sharedChildIds: string[] = [];
  try {
    await client.query("BEGIN");
    const profile = await client.query<{ email: string }>(
      "SELECT email FROM app_user WHERE id = $1 FOR UPDATE",
      [session.userId],
    );
    if (profile.rowCount !== 1) {
      await client.query("ROLLBACK");
      response.status(401).json({ error: "Sign in is required" });
      return;
    }
    if (emailConfirmation !== profile.rows[0].email) {
      await client.query("ROLLBACK");
      response.status(400).json({ error: "Enter your account email to confirm deletion" });
      return;
    }
    const memberships = await client.query<{
      child_id: string;
      role: "owner" | "care_manager" | "caregiver" | "viewer";
    }>(
      "SELECT child_id, role FROM child_membership WHERE user_id = $1 FOR UPDATE",
      [session.userId],
    );
    for (const member of memberships.rows) {
      if (member.role !== "owner") {
        sharedChildIds.push(member.child_id);
        continue;
      }
      const successor = await client.query<{ user_id: string }>(
        "SELECT user_id FROM child_membership WHERE child_id = $1 AND user_id <> $2 ORDER BY joined_at ASC LIMIT 1 FOR UPDATE",
        [member.child_id, session.userId],
      );
      if (successor.rowCount) {
        await client.query(
          "UPDATE child_membership SET role = 'owner' WHERE child_id = $1 AND user_id = $2",
          [member.child_id, successor.rows[0].user_id],
        );
        sharedChildIds.push(member.child_id);
      } else {
        await client.query("DELETE FROM child WHERE id = $1", [member.child_id]);
      }
    }
    await client.query("DELETE FROM child_invitation WHERE invited_by = $1 OR lower(email) = lower($2)", [
      session.userId,
      profile.rows[0].email,
    ]);
    await client.query("DELETE FROM log_comment WHERE created_by = $1", [session.userId]);
    await client.query("DELETE FROM child_note WHERE created_by = $1", [session.userId]);
    await client.query("DELETE FROM child_membership WHERE user_id = $1", [session.userId]);
    await client.query("DELETE FROM app_user WHERE id = $1", [session.userId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  for (const childId of sharedChildIds) io.to(childRoom(childId)).emit("timeline:changed");
  response.clearCookie("nurture_session");
  response.status(204).end();
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
    role: "owner" | "care_manager" | "caregiver" | "viewer";
    joined_at: string;
  }>(
    `SELECT member.user_id AS id, user_account.display_name, user_account.email, member.role, member.joined_at
     FROM child_membership AS member
     JOIN app_user AS user_account ON user_account.id = member.user_id
     JOIN child_membership AS requester ON requester.child_id = member.child_id
     WHERE member.child_id = $1 AND requester.user_id = $2
     ORDER BY CASE member.role WHEN 'owner' THEN 0 WHEN 'care_manager' THEN 1 WHEN 'caregiver' THEN 2 ELSE 3 END, member.joined_at ASC`,
    [request.params.childId, session.userId],
  );
  response.json(result.rows);
});
app.put("/api/children/:childId/members/:memberId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { role } = request.body as {
    role: "care_manager" | "caregiver" | "viewer";
  };
  if (role !== "care_manager" && role !== "caregiver" && role !== "viewer") {
    response
      .status(400)
      .json({ error: "Choose care manager, caregiver, or viewer access" });
    return;
  }
  const updated = await pool.query<{ user_id: string }>(
    `UPDATE child_membership AS member
     SET role = $1
     FROM child_membership AS requester
     WHERE member.child_id = $2
       AND member.user_id = $3
       AND member.role <> 'owner'
       AND requester.child_id = member.child_id
       AND requester.user_id = $4
       AND requester.role IN ('owner', 'care_manager')
       AND (requester.role = 'owner' OR member.role <> 'care_manager')
     RETURNING member.user_id`,
    [role, request.params.childId, request.params.memberId, session.userId],
  );
  if (updated.rowCount !== 1) {
    response.status(403).json({ error: "Owner or care manager access is required" });
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
     USING child_membership AS requester
     WHERE member.child_id = $1
       AND member.user_id = $2
       AND member.role <> 'owner'
       AND requester.child_id = member.child_id
       AND requester.user_id = $3
       AND requester.role IN ('owner', 'care_manager')
     RETURNING member.user_id`,
    [request.params.childId, request.params.memberId, session.userId],
  );
  if (removed.rowCount !== 1) {
    response.status(403).json({ error: "Owner or care manager access is required" });
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
      "INSERT INTO activity_definition (child_id, name, kind, color, icon) VALUES ($1, 'Feeding', 'feeding', '#ba5c30', 'utensils'), ($1, 'Diaper change', 'diaper', '#526cdb', 'droplets')",
      [id],
    );
    await client.query(
      `
      WITH defaults (kind, field_key, label, field_type, unit, options, dashboard_metrics) AS (
        VALUES
          ('diaper'::activity_kind, 'type', 'Diaper type', 'select', NULL, '["Wet", "Dirty", "Mixed", "Empty"]'::jsonb, '["count"]'::jsonb)
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
  const deleted = await pool.query(
    "DELETE FROM child WHERE id = $1 AND EXISTS (SELECT 1 FROM child_membership WHERE child_id = child.id AND user_id = $2 AND role = 'owner') RETURNING id",
    [request.params.childId, session.userId],
  );
  if (deleted.rowCount !== 1) {
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
    role: "owner" | "care_manager" | "caregiver" | "viewer";
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
      role: "owner" | "care_manager" | "caregiver" | "viewer";
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
  const [timeline, insightPreference, activities, fields, schedules, gaps, analyticsRows] = await Promise.all([
    pool.query(
      `SELECT log.id, log.activity_id, log.event_time, log.event_timezone, log.field_values, log.note, log.created_at, log.created_by AS created_by_id, activity.name AS activity_name, activity.kind, activity.color, activity.icon, COALESCE(author.display_name, 'Deleted caregiver') AS created_by, COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', portion.kind, 'delivery_method', portion.delivery_method, 'amount_ml', portion.amount_ml, 'duration_minutes', portion.duration_minutes) ORDER BY portion.position) FROM feeding_portion AS portion WHERE portion.log_id = log.id), '[]'::jsonb) AS feeding_portions, comment_preview.comment_count, comment_preview.first_comment, comment_preview.first_comment_author FROM activity_log AS log JOIN activity_definition AS activity ON activity.id = log.activity_id LEFT JOIN app_user AS author ON author.id = log.created_by LEFT JOIN LATERAL (SELECT COUNT(*)::int AS comment_count, (array_agg(comment.body ORDER BY comment.created_at, comment.id))[1] AS first_comment, (array_agg(comment_author.display_name ORDER BY comment.created_at, comment.id))[1] AS first_comment_author FROM log_comment AS comment JOIN app_user AS comment_author ON comment_author.id = comment.created_by WHERE comment.log_id = log.id) AS comment_preview ON true WHERE log.child_id = $1 ORDER BY log.event_time DESC LIMIT 100`,
      [childId],
    ),
    pool.query(
      "SELECT activity_ids FROM child_insight_preference WHERE child_id = $1 AND user_id = $2",
      [childId, session.userId],
    ),
    pool.query(
      "SELECT id, name, kind, color, icon FROM activity_definition WHERE child_id = $1 AND archived_at IS NULL ORDER BY created_at",
      [childId],
    ),
    pool.query(
      `SELECT field.id, field.activity_id, field.field_key, field.label, field.field_type, field.unit, field.options, field.boolean_true_label, field.boolean_false_label, field.dashboard_metrics FROM activity_field_definition AS field JOIN activity_definition AS activity ON activity.id = field.activity_id WHERE activity.child_id = $1 AND field.archived_at IS NULL ORDER BY field.id`,
      [childId],
    ),
    pool.query(
      `SELECT schedule.activity_id, schedule.kind, schedule.interval_minutes, schedule.scheduled_for,
         recent_log.event_time AS last_event_time
       FROM activity_schedule AS schedule
       JOIN activity_definition AS activity ON activity.id = schedule.activity_id
       LEFT JOIN LATERAL (
         SELECT log.event_time
         FROM activity_log AS log
         WHERE log.activity_id = activity.id
         ORDER BY log.event_time DESC
         LIMIT 1
       ) AS recent_log ON true
       WHERE activity.child_id = $1
         AND activity.archived_at IS NULL
         AND schedule.completed_at IS NULL
       ORDER BY schedule.scheduled_for NULLS LAST`,
      [childId],
    ),
    pool.query(
      `SELECT gap.id, gap.starts_at, gap.ends_at, gap.reason, gap.include_in_averages,
         gap.created_at, COALESCE(author.display_name, 'Deleted caregiver') AS created_by
       FROM care_gap AS gap
       LEFT JOIN app_user AS author ON author.id = gap.created_by
       WHERE gap.child_id = $1
       ORDER BY gap.starts_at DESC`,
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
           portions.bottle_portion_count,
           portions.breastfeeding_portion_count,
           portions.total_amount_ml,
           portions.total_breastfeeding_minutes,
           CASE WHEN portions.total_amount_ml > 0 THEN 1 ELSE 0 END AS bottle_fed_count,
           CASE WHEN portions.total_breastfeeding_minutes > 0 THEN 1 ELSE 0 END AS breast_fed_count
         FROM activity_log AS log
         CROSS JOIN child_timezone
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS portion_count,
             COUNT(*) FILTER (WHERE portion.delivery_method = 'bottle')::int AS bottle_portion_count,
             COUNT(*) FILTER (WHERE portion.delivery_method = 'breastfeeding')::int AS breastfeeding_portion_count,
             COALESCE(SUM(portion.amount_ml), 0)::float8 AS total_amount_ml,
             COALESCE(SUM(portion.duration_minutes), 0)::float8 AS total_breastfeeding_minutes
           FROM feeding_portion AS portion
           WHERE portion.log_id = log.id
         ) AS portions ON true
         WHERE log.child_id = $1
       ),
       daily AS (
         SELECT activity_id, local_date,
           COUNT(*)::int AS count,
           COALESCE(SUM(portion_count), 0)::int AS portion_count,
           COALESCE(SUM(bottle_portion_count), 0)::int AS bottle_portion_count,
           COALESCE(SUM(breastfeeding_portion_count), 0)::int AS breastfeeding_portion_count,
           COALESCE(SUM(total_amount_ml), 0)::float8 AS total_amount_ml,
           COALESCE(SUM(total_breastfeeding_minutes), 0)::float8 AS total_breastfeeding_minutes,
           COALESCE(SUM(bottle_fed_count), 0)::int AS bottle_fed_count,
           COALESCE(SUM(breast_fed_count), 0)::int AS breast_fed_count
         FROM log_metrics
         GROUP BY activity_id, local_date
       ),
       excluded_average_days AS (
         SELECT DISTINCT series.local_date::date AS local_date
         FROM care_gap
         CROSS JOIN child_timezone
         CROSS JOIN LATERAL generate_series(
           (care_gap.starts_at AT TIME ZONE child_timezone.timezone)::date,
           ((care_gap.ends_at AT TIME ZONE child_timezone.timezone) - INTERVAL '1 microsecond')::date,
           INTERVAL '1 day'
         ) AS series(local_date)
         WHERE care_gap.child_id = $1 AND NOT care_gap.include_in_averages
       ),
       first_record AS (
         SELECT MIN(local_date) AS first_record_date
         FROM log_metrics
       ),
       average_metrics AS (
         SELECT activity_id,
           AVG(count)::float8 AS count,
           AVG(portion_count)::float8 AS portion_count,
           AVG(bottle_portion_count)::float8 AS bottle_portion_count,
           AVG(breastfeeding_portion_count)::float8 AS breastfeeding_portion_count,
           AVG(total_amount_ml)::float8 AS total_amount_ml,
           AVG(total_breastfeeding_minutes)::float8 AS total_breastfeeding_minutes,
           SUM(total_amount_ml) / NULLIF(SUM(bottle_fed_count), 0)::float8 AS average_amount_ml,
           SUM(total_breastfeeding_minutes) / NULLIF(SUM(breast_fed_count), 0)::float8 AS average_breastfeeding_minutes
         FROM daily
         LEFT JOIN excluded_average_days ON excluded_average_days.local_date = daily.local_date
         WHERE excluded_average_days.local_date IS NULL
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
           COALESCE(SUM(bottle_portion_count), 0)::int AS bottle_portion_count,
           COALESCE(SUM(breastfeeding_portion_count), 0)::int AS breastfeeding_portion_count,
           COALESCE(SUM(total_amount_ml), 0)::float8 AS total_amount_ml,
           COALESCE(SUM(total_breastfeeding_minutes), 0)::float8 AS total_breastfeeding_minutes,
           SUM(total_amount_ml) / NULLIF(SUM(bottle_fed_count), 0)::float8 AS average_amount_ml,
           SUM(total_breastfeeding_minutes) / NULLIF(SUM(breast_fed_count), 0)::float8 AS average_breastfeeding_minutes
         FROM log_metrics
         WHERE event_time >= now() - INTERVAL '24 hours'
         GROUP BY activity_id
       ),
       ranked_history AS (
         SELECT daily.*, excluded_average_days.local_date IS NOT NULL AS excluded_from_average,
           ROW_NUMBER() OVER (PARTITION BY activity_id ORDER BY daily.local_date DESC) AS position
         FROM daily
         LEFT JOIN excluded_average_days ON excluded_average_days.local_date = daily.local_date
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
               'bottle_portion_count', bottle_portion_count,
               'breastfeeding_portion_count', breastfeeding_portion_count,
               'total_amount_ml', total_amount_ml,
               'total_breastfeeding_minutes', total_breastfeeding_minutes,
               'average_amount_ml', total_amount_ml / NULLIF(bottle_fed_count, 0)::float8,
               'average_breastfeeding_minutes', total_breastfeeding_minutes / NULLIF(breast_fed_count, 0)::float8,
               'excluded_from_average', excluded_from_average
             )
             ORDER BY local_date DESC
           ) AS days
         FROM ranked_history
         WHERE position <= 14
         GROUP BY activity_id
       )
       SELECT activity.id AS activity_id,
         first_record.first_record_date,
         COALESCE(average_metrics.count, 0)::float8 AS average_count,
         COALESCE(average_metrics.portion_count, 0)::float8 AS average_portion_count,
         COALESCE(average_metrics.bottle_portion_count, 0)::float8 AS average_bottle_portion_count,
         COALESCE(average_metrics.breastfeeding_portion_count, 0)::float8 AS average_breastfeeding_portion_count,
         COALESCE(average_metrics.total_amount_ml, 0)::float8 AS average_total_amount_ml,
         COALESCE(average_metrics.total_breastfeeding_minutes, 0)::float8 AS average_total_breastfeeding_minutes,
         average_metrics.average_amount_ml,
         average_metrics.average_breastfeeding_minutes,
         COALESCE(calendar_day_metrics.count, 0)::int AS calendar_day_count,
         COALESCE(calendar_day_metrics.portion_count, 0)::int AS calendar_day_portion_count,
         COALESCE(calendar_day_metrics.bottle_portion_count, 0)::int AS calendar_day_bottle_portion_count,
         COALESCE(calendar_day_metrics.breastfeeding_portion_count, 0)::int AS calendar_day_breastfeeding_portion_count,
         COALESCE(calendar_day_metrics.total_amount_ml, 0)::float8 AS calendar_day_total_amount_ml,
         COALESCE(calendar_day_metrics.total_breastfeeding_minutes, 0)::float8 AS calendar_day_total_breastfeeding_minutes,
         calendar_day_metrics.total_amount_ml / NULLIF(calendar_day_metrics.bottle_fed_count, 0)::float8 AS calendar_day_average_amount_ml,
         calendar_day_metrics.total_breastfeeding_minutes / NULLIF(calendar_day_metrics.breast_fed_count, 0)::float8 AS calendar_day_average_breastfeeding_minutes,
         COALESCE(last_24_hours_metrics.count, 0)::int AS last_24_hours_count,
         COALESCE(last_24_hours_metrics.portion_count, 0)::int AS last_24_hours_portion_count,
         COALESCE(last_24_hours_metrics.bottle_portion_count, 0)::int AS last_24_hours_bottle_portion_count,
         COALESCE(last_24_hours_metrics.breastfeeding_portion_count, 0)::int AS last_24_hours_breastfeeding_portion_count,
         COALESCE(last_24_hours_metrics.total_amount_ml, 0)::float8 AS last_24_hours_total_amount_ml,
         COALESCE(last_24_hours_metrics.total_breastfeeding_minutes, 0)::float8 AS last_24_hours_total_breastfeeding_minutes,
         last_24_hours_metrics.average_amount_ml AS last_24_hours_average_amount_ml,
         last_24_hours_metrics.average_breastfeeding_minutes AS last_24_hours_average_breastfeeding_minutes,
         COALESCE(history_metrics.days, '[]'::jsonb) AS history
       FROM activity_definition AS activity
       CROSS JOIN first_record
       LEFT JOIN average_metrics ON average_metrics.activity_id = activity.id
       LEFT JOIN calendar_day_metrics ON calendar_day_metrics.activity_id = activity.id
       LEFT JOIN last_24_hours_metrics ON last_24_hours_metrics.activity_id = activity.id
       LEFT JOIN history_metrics ON history_metrics.activity_id = activity.id
       WHERE activity.child_id = $1 AND activity.archived_at IS NULL
       ORDER BY activity.created_at`,
      [childId],
    ),
  ]);
  const scheduleByActivityId = new Map(
    schedules.rows.map((schedule) => [schedule.activity_id, schedule]),
  );
  const activitiesWithFields = activities.rows.map((activity) => ({
    ...activity,
    fields: fields.rows.filter((field) => field.activity_id === activity.id),
    schedule: scheduleByActivityId.get(activity.id) ?? null,
  }));
  const metrics = (row: {
    count: number;
    portion_count: number;
    bottle_portion_count: number;
    breastfeeding_portion_count: number;
    total_amount_ml: number;
    total_breastfeeding_minutes: number;
    average_amount_ml: number | null;
    average_breastfeeding_minutes: number | null;
  }) => ({
    count: Number(row.count),
    portion_count: Number(row.portion_count),
    bottle_portion_count: Number(row.bottle_portion_count),
    breastfeeding_portion_count: Number(row.breastfeeding_portion_count),
    total_amount_ml: Number(row.total_amount_ml),
    total_breastfeeding_minutes: Number(row.total_breastfeeding_minutes),
    average_amount_ml:
      row.average_amount_ml === null ? null : Number(row.average_amount_ml),
    average_breastfeeding_minutes:
      row.average_breastfeeding_minutes === null
        ? null
        : Number(row.average_breastfeeding_minutes),
  });
  const analytics = analyticsRows.rows.map((row) => ({
    activity_id: row.activity_id,
    average: metrics({
      count: row.average_count,
      portion_count: row.average_portion_count,
      bottle_portion_count: row.average_bottle_portion_count,
      breastfeeding_portion_count: row.average_breastfeeding_portion_count,
      total_amount_ml: row.average_total_amount_ml,
      total_breastfeeding_minutes: row.average_total_breastfeeding_minutes,
      average_amount_ml: row.average_amount_ml,
      average_breastfeeding_minutes: row.average_breastfeeding_minutes,
    }),
    calendar_day: metrics({
      count: row.calendar_day_count,
      portion_count: row.calendar_day_portion_count,
      bottle_portion_count: row.calendar_day_bottle_portion_count,
      breastfeeding_portion_count: row.calendar_day_breastfeeding_portion_count,
      total_amount_ml: row.calendar_day_total_amount_ml,
      total_breastfeeding_minutes: row.calendar_day_total_breastfeeding_minutes,
      average_amount_ml: row.calendar_day_average_amount_ml,
      average_breastfeeding_minutes: row.calendar_day_average_breastfeeding_minutes,
    }),
    last_24_hours: metrics({
      count: row.last_24_hours_count,
      portion_count: row.last_24_hours_portion_count,
      bottle_portion_count: row.last_24_hours_bottle_portion_count,
      breastfeeding_portion_count: row.last_24_hours_breastfeeding_portion_count,
      total_amount_ml: row.last_24_hours_total_amount_ml,
      total_breastfeeding_minutes: row.last_24_hours_total_breastfeeding_minutes,
      average_amount_ml: row.last_24_hours_average_amount_ml,
      average_breastfeeding_minutes: row.last_24_hours_average_breastfeeding_minutes,
    }),
    history: row.history.map(
      (day: {
        date: string;
        count: number;
        portion_count: number;
        bottle_portion_count: number;
        breastfeeding_portion_count: number;
        total_amount_ml: number;
        total_breastfeeding_minutes: number;
        average_amount_ml: number | null;
        average_breastfeeding_minutes: number | null;
        excluded_from_average: boolean;
      }) => ({
        date: String(day.date).slice(0, 10),
        ...metrics(day),
        excluded_from_average: day.excluded_from_average,
      }),
    ),
  }));
  response.json({
    role: access.rows[0].role,
    timeline: timeline.rows,
    activities: activitiesWithFields,
    gaps: gaps.rows,
    analytics,
    first_record_date: analyticsRows.rows[0]?.first_record_date
      ? new Date(analyticsRows.rows[0].first_record_date)
          .toISOString()
          .slice(0, 10)
      : null,
    insight_activity_ids:
      insightPreference.rows[0]?.activity_ids?.map(String) ?? null,
  });
});
app.put("/api/children/:childId/insight-preferences", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { childId } = request.params;
  const access = await membership(childId, session.userId);
  if (access.rowCount !== 1) {
    response.status(403).json({ error: "Child access is required" });
    return;
  }
  const { activityIds } = request.body as { activityIds?: unknown };
  if (!Array.isArray(activityIds) || !activityIds.every((id) => typeof id === "string")) {
    response.status(400).json({ error: "Activity selections are required" });
    return;
  }
  await pool.query(
    `INSERT INTO child_insight_preference (child_id, user_id, activity_ids)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (child_id, user_id)
     DO UPDATE SET activity_ids = EXCLUDED.activity_ids, updated_at = now()`,
    [childId, session.userId, JSON.stringify([...new Set(activityIds)])],
  );
  response.status(204).end();
});
app.post("/api/children/:childId/logs", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { childId } = request.params;
  const { activityId, eventTime, eventTimezone, fieldValues, portions, note, completeOneTimeSchedule } =
    request.body as {
      activityId: string;
      eventTime: string;
      eventTimezone: string;
      fieldValues: Record<string, unknown>;
      portions?: {
        kind: "breast_milk" | "formula";
        deliveryMethod: "bottle" | "breastfeeding";
        amountMl?: number;
        durationMinutes?: number;
      }[];
      note?: string;
      completeOneTimeSchedule?: boolean;
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
      `SELECT activity.kind FROM child_membership AS membership JOIN activity_definition AS activity ON activity.id = $2 AND activity.child_id = membership.child_id WHERE membership.child_id = $1 AND membership.user_id = $3 AND membership.role IN ('owner', 'care_manager', 'caregiver') AND activity.archived_at IS NULL`,
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
            amount_ml: portion.deliveryMethod === "bottle" ? Number(portion.amountMl) : null,
            duration_minutes: portion.deliveryMethod === "breastfeeding" ? Number(portion.durationMinutes) : null,
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
            (portion.delivery_method === "bottle" &&
              (!Number.isFinite(portion.amount_ml) || portion.amount_ml === null || portion.amount_ml <= 0)) ||
            (portion.delivery_method === "breastfeeding" &&
              (portion.kind !== "breast_milk" ||
                !Number.isFinite(portion.duration_minutes) ||
                portion.duration_minutes === null ||
                portion.duration_minutes <= 0)),
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
        `INSERT INTO feeding_portion (log_id, kind, delivery_method, amount_ml, duration_minutes, position)
         SELECT $1, portion.kind, portion.delivery_method, portion.amount_ml, portion.duration_minutes, portion.position
         FROM jsonb_to_recordset($2::jsonb) AS portion(kind text, delivery_method text, amount_ml numeric, duration_minutes numeric, position smallint)`,
        [inserted.rows[0].id, JSON.stringify(feedingPortions)],
      );
    if (completeOneTimeSchedule) {
      const completedSchedule = await client.query(
        `UPDATE activity_schedule
         SET completed_at = now(), updated_at = now()
         WHERE activity_id = $1
           AND kind = 'one_time'
           AND completed_at IS NULL
         RETURNING activity_id`,
        [activityId],
      );
      if (completedSchedule.rowCount !== 1) {
        await client.query("ROLLBACK");
        response.status(409).json({ error: "One-time reminder is no longer available" });
        return;
      }
    }
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
    `DELETE FROM activity_log AS log USING child_membership AS membership WHERE log.id = $1 AND membership.child_id = log.child_id AND membership.user_id = $2 AND (membership.role IN ('owner', 'care_manager') OR log.created_by = $2) RETURNING log.child_id`,
    [request.params.logId, session.userId],
  );
  if (deleted.rowCount !== 1) {
    response
      .status(403)
      .json({ error: "Only the log creator, owner, or care manager can delete this record" });
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
        amountMl?: number;
        durationMinutes?: number;
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
       WHERE log.id = $1 AND membership.user_id = $3 AND (membership.role IN ('owner', 'care_manager') OR log.created_by = $3) AND activity.archived_at IS NULL`,
      [request.params.logId, activityId, session.userId],
    );
    if (access.rowCount !== 1) {
      await client.query("ROLLBACK");
      response
        .status(403)
        .json({ error: "Only the log creator, care manager, or owner can edit this record" });
      return;
    }
    const feedingPortions =
      access.rows[0].kind === "feeding"
        ? (portions ?? []).map((portion, position) => ({
            kind: portion.kind,
            delivery_method: portion.deliveryMethod,
            amount_ml: portion.deliveryMethod === "bottle" ? Number(portion.amountMl) : null,
            duration_minutes: portion.deliveryMethod === "breastfeeding" ? Number(portion.durationMinutes) : null,
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
            (portion.delivery_method === "bottle" &&
              (!Number.isFinite(portion.amount_ml) || portion.amount_ml === null || portion.amount_ml <= 0)) ||
            (portion.delivery_method === "breastfeeding" &&
              (portion.kind !== "breast_milk" ||
                !Number.isFinite(portion.duration_minutes) ||
                portion.duration_minutes === null ||
                portion.duration_minutes <= 0)),
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
        `INSERT INTO feeding_portion (log_id, kind, delivery_method, amount_ml, duration_minutes, position)
         SELECT $1, portion.kind, portion.delivery_method, portion.amount_ml, portion.duration_minutes, portion.position
         FROM jsonb_to_recordset($2::jsonb) AS portion(kind text, delivery_method text, amount_ml numeric, duration_minutes numeric, position smallint)`,
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
  const { startsAt, endsAt, reason, includeInAverages } = request.body as {
    startsAt: string;
    endsAt: string;
    reason?: string;
    includeInAverages?: boolean;
  };
  const access = await membership(childId, session.userId);
  if (access.rows[0]?.role === "viewer") {
    response.status(403).json({ error: "Caregiver access is required" });
    return;
  }
  const inserted = await pool.query(
    "INSERT INTO care_gap (child_id, starts_at, ends_at, reason, include_in_averages, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
    [childId, startsAt, endsAt, reason ?? null, includeInAverages === true, session.userId],
  );
  io.to(childRoom(childId)).emit("timeline:changed");
  response.status(201).json(inserted.rows[0]);
});
app.put("/api/children/:childId/gaps/:gapId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { startsAt, endsAt, reason, includeInAverages } = request.body as {
    startsAt: string;
    endsAt: string;
    reason?: string;
    includeInAverages?: boolean;
  };
  const access = await membership(request.params.childId, session.userId);
  if (access.rows[0]?.role === "viewer") {
    response.status(403).json({ error: "Caregiver access is required" });
    return;
  }
  const updated = await pool.query(
    `UPDATE care_gap
     SET starts_at = $1, ends_at = $2, reason = $3, include_in_averages = $4
     WHERE id = $5 AND child_id = $6
     RETURNING *`,
    [startsAt, endsAt, reason ?? null, includeInAverages === true, request.params.gapId, request.params.childId],
  );
  if (updated.rowCount !== 1) {
    response.status(404).json({ error: "Care pause not found" });
    return;
  }
  io.to(childRoom(request.params.childId)).emit("timeline:changed");
  response.status(204).end();
});
app.delete("/api/children/:childId/gaps/:gapId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const access = await membership(request.params.childId, session.userId);
  if (access.rows[0]?.role === "viewer") {
    response.status(403).json({ error: "Caregiver access is required" });
    return;
  }
  const deleted = await pool.query(
    "DELETE FROM care_gap WHERE id = $1 AND child_id = $2 RETURNING id",
    [request.params.gapId, request.params.childId],
  );
  if (deleted.rowCount !== 1) {
    response.status(404).json({ error: "Care pause not found" });
    return;
  }
  io.to(childRoom(request.params.childId)).emit("timeline:changed");
  response.status(204).end();
});
app.post("/api/children/:childId/invitations", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { childId } = request.params;
  const { email: rawEmail, role } = request.body as {
    email?: string;
    role: "care_manager" | "caregiver" | "viewer";
  };
  const email = rawEmail?.trim().toLowerCase() || null;
  const access = await membership(childId, session.userId);
  if (!['owner', 'care_manager'].includes(access.rows[0]?.role ?? '')) {
    response.status(403).json({ error: "Owner or care manager access is required" });
    return;
  }
  const invite = await pool.query<{ token: string }>(
    "INSERT INTO child_invitation (child_id, email, role, invited_by) VALUES ($1, $2, $3, $4) RETURNING token",
    [childId, email, role, session.userId],
  );
  response.status(201).json({
    token: invite.rows[0].token,
    acceptUrl: new URL(
      `/?invite=${invite.rows[0].token}`,
      process.env.APP_URL ?? "http://localhost:5173",
    ).toString(),
  });
});
app.get("/api/invitations/:token", async (request, response) => {
  const session = sessionFrom(request);
  const { token } = request.params;
  const invite = await pool.query<{
    child_name: string;
    invited_by_name: string;
    created_at: string;
    role: "care_manager" | "caregiver" | "viewer";
  }>(
    `SELECT child.name AS child_name, inviter.display_name AS invited_by_name, invitation.created_at, invitation.role FROM child_invitation AS invitation JOIN child ON child.id = invitation.child_id JOIN app_user AS inviter ON inviter.id = invitation.invited_by LEFT JOIN app_user AS recipient ON recipient.id = $2 WHERE invitation.token = $1 AND invitation.accepted_at IS NULL AND invitation.expires_at > now() AND (invitation.email IS NULL OR lower(invitation.email) = lower(recipient.email))`,
    [token, session?.userId ?? null],
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
  const { name, color, icon = "heart-pulse", fields } = request.body as {
    name: string;
    color: string;
    icon?: string;
    fields: ActivityFieldInput[];
  };
  if (!/^#[\da-f]{6}$/i.test(color)) {
    response.status(400).json({ error: "Activity color must be a six-digit hex color" });
    return;
  }
  if (!customActivityIcons.has(icon)) {
    response.status(400).json({ error: "Activity icon is not supported" });
    return;
  }
  if (!Array.isArray(fields)) {
    response.status(400).json({ error: "Activity fields are required" });
    return;
  }
  const configuredFields = fields.map(activityFieldConfiguration);
  if (configuredFields.some((field) => field === null)) {
    response.status(400).json({ error: "Each field needs a name and valid type-specific settings" });
    return;
  }
  if (new Set(configuredFields.map((field) => field!.key)).size !== configuredFields.length) {
    response.status(400).json({ error: "Each field needs a unique key" });
    return;
  }
  const access = await membership(childId, session.userId);
  if (!['owner', 'care_manager'].includes(access.rows[0]?.role ?? '')) {
    response.status(403).json({ error: "Owner or care manager access is required" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const activity = await client.query<{ id: string }>(
      "INSERT INTO activity_definition (child_id, name, kind, color, icon) VALUES ($1, $2, 'custom', $3, $4) RETURNING id",
      [childId, name, color, icon],
    );
    for (const field of configuredFields)
      await client.query(
        "INSERT INTO activity_field_definition (activity_id, field_key, label, field_type, unit, options, boolean_true_label, boolean_false_label, dashboard_metrics) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)",
        [
          activity.rows[0].id,
          field!.key,
          field!.label,
          field!.type,
          field!.unit,
          JSON.stringify(field!.options),
          field!.booleanTrueLabel,
          field!.booleanFalseLabel,
          JSON.stringify(field!.metrics),
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
  const { fieldKey, label, fieldType, unit, options, booleanTrueLabel, booleanFalseLabel, metrics } =
    request.body as {
      fieldKey: string;
      label: string;
      fieldType: string;
      unit?: string;
      options?: string[];
      booleanTrueLabel?: string;
      booleanFalseLabel?: string;
      metrics?: string[];
    };
  const field = activityFieldConfiguration({
    key: fieldKey,
    label,
    type: fieldType as ActivityFieldInput["type"],
    unit,
    options,
    booleanTrueLabel,
    booleanFalseLabel,
    metrics,
  });
  if (!field) {
    response
      .status(400)
      .json({ error: "A valid field name and type are required" });
    return;
  }
  const activity = await pool.query<{ child_id: string }>(
    `SELECT activity.child_id FROM activity_definition AS activity JOIN child_membership AS membership ON membership.child_id = activity.child_id WHERE activity.id = $1 AND membership.user_id = $2 AND membership.role IN ('owner', 'care_manager')`,
    [request.params.activityId, session.userId],
  );
  if (activity.rowCount !== 1) {
    response.status(403).json({ error: "Owner or care manager access is required" });
    return;
  }
  await pool.query(
    "INSERT INTO activity_field_definition (activity_id, field_key, label, field_type, unit, options, boolean_true_label, boolean_false_label, dashboard_metrics) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)",
    [
      request.params.activityId,
      field.key,
      field.label,
      field.type,
      field.unit,
      JSON.stringify(field.options),
      field.booleanTrueLabel,
      field.booleanFalseLabel,
      JSON.stringify(field.metrics),
    ],
  );
  io.to(childRoom(activity.rows[0].child_id)).emit("timeline:changed");
  response.status(201).end();
});
app.put("/api/activities/:activityId/fields", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { fields } = request.body as { fields?: ActivityFieldInput[] };
  if (!Array.isArray(fields)) {
    response.status(400).json({ error: "Activity fields are required" });
    return;
  }
  const configuredFields = fields.map(activityFieldConfiguration);
  if (configuredFields.some((field) => field === null)) {
    response.status(400).json({ error: "Each field needs a name and valid type-specific settings" });
    return;
  }
  if (new Set(configuredFields.map((field) => field!.key)).size !== configuredFields.length) {
    response.status(400).json({ error: "Each field needs a unique key" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const activity = await client.query<{ child_id: string }>(
      `SELECT activity.child_id
       FROM activity_definition AS activity
       JOIN child_membership AS membership ON membership.child_id = activity.child_id
       WHERE activity.id = $1
         AND activity.archived_at IS NULL
         AND membership.user_id = $2
         AND membership.role IN ('owner', 'care_manager')`,
      [request.params.activityId, session.userId],
    );
    if (activity.rowCount !== 1) {
      await client.query("ROLLBACK");
      response.status(403).json({ error: "Owner or care manager access is required" });
      return;
    }
    const activeFieldIds: string[] = [];
    for (const [index, field] of configuredFields.entries()) {
      const input = fields[index];
      if (input.id) {
        const updated = await client.query<{ id: string }>(
          `UPDATE activity_field_definition
           SET label = $1, field_type = $2, unit = $3, options = $4::jsonb,
               boolean_true_label = $5, boolean_false_label = $6, dashboard_metrics = $7::jsonb
           WHERE id = $8 AND activity_id = $9 AND archived_at IS NULL
           RETURNING id`,
          [
            field!.label,
            field!.type,
            field!.unit,
            JSON.stringify(field!.options),
            field!.booleanTrueLabel,
            field!.booleanFalseLabel,
            JSON.stringify(field!.metrics),
            input.id,
            request.params.activityId,
          ],
        );
        if (updated.rowCount !== 1) throw new Error("Activity field is not available");
        activeFieldIds.push(updated.rows[0].id);
      } else {
        const inserted = await client.query<{ id: string }>(
          `INSERT INTO activity_field_definition
             (activity_id, field_key, label, field_type, unit, options, boolean_true_label, boolean_false_label, dashboard_metrics)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::jsonb)
           RETURNING id`,
          [
            request.params.activityId,
            field!.key,
            field!.label,
            field!.type,
            field!.unit,
            JSON.stringify(field!.options),
            field!.booleanTrueLabel,
            field!.booleanFalseLabel,
            JSON.stringify(field!.metrics),
          ],
        );
        activeFieldIds.push(inserted.rows[0].id);
      }
    }
    await client.query(
      activeFieldIds.length
        ? "UPDATE activity_field_definition SET archived_at = now() WHERE activity_id = $1 AND archived_at IS NULL AND NOT (id = ANY($2::uuid[]))"
        : "UPDATE activity_field_definition SET archived_at = now() WHERE activity_id = $1 AND archived_at IS NULL",
      activeFieldIds.length ? [request.params.activityId, activeFieldIds] : [request.params.activityId],
    );
    await client.query("COMMIT");
    io.to(childRoom(activity.rows[0].child_id)).emit("timeline:changed");
    response.status(204).end();
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});
app.delete("/api/activities/:activityId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const archived = await pool.query<{ child_id: string }>(
    `UPDATE activity_definition AS activity SET archived_at = now() FROM child_membership AS membership WHERE activity.id = $1 AND membership.child_id = activity.child_id AND membership.user_id = $2 AND membership.role IN ('owner', 'care_manager') RETURNING activity.child_id`,
    [request.params.activityId, session.userId],
  );
  if (archived.rowCount !== 1) {
    response.status(403).json({ error: "Owner or care manager access is required" });
    return;
  }
  await pool.query("DELETE FROM activity_schedule WHERE activity_id = $1", [
    request.params.activityId,
  ]);
  io.to(childRoom(archived.rows[0].child_id)).emit("timeline:changed");
  response.status(204).end();
});
app.put("/api/activities/:activityId", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { name, color, icon } = request.body as { name: string; color: string; icon?: string };
  if (!name.trim() || !/^#[\da-f]{6}$/i.test(color) || (icon !== undefined && !customActivityIcons.has(icon))) {
    response.status(400).json({ error: "Activity name and a six-digit hex color are required" });
    return;
  }
  const updated = await pool.query<{ child_id: string }>(
    `UPDATE activity_definition AS activity
     SET name = $1, color = $2, icon = COALESCE($3, activity.icon)
     FROM child_membership AS membership
       WHERE activity.id = $4
       AND membership.child_id = activity.child_id
       AND membership.user_id = $5
       AND membership.role IN ('owner', 'care_manager')
       AND activity.archived_at IS NULL
     RETURNING activity.child_id`,
    [name.trim(), color, icon ?? null, request.params.activityId, session.userId],
  );
  if (updated.rowCount !== 1) {
    response.status(403).json({ error: "Owner or care manager access is required" });
    return;
  }
  io.to(childRoom(updated.rows[0].child_id)).emit("timeline:changed");
  response.status(204).end();
});
app.put("/api/activities/:activityId/schedule", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const { kind, intervalMinutes, scheduledFor } = request.body as {
      kind: "interval" | "one_time";
      intervalMinutes?: number | null;
      scheduledFor?: string | null;
  };
  if (
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
    `INSERT INTO activity_schedule (activity_id, kind, interval_minutes, scheduled_for)
     SELECT activity.id, $2, $3, $4
     FROM activity_definition AS activity
     JOIN child_membership AS membership ON membership.child_id = activity.child_id
     WHERE activity.id = $1
       AND activity.archived_at IS NULL
       AND membership.user_id = $5
       AND membership.role IN ('owner', 'care_manager')
     ON CONFLICT (activity_id) DO UPDATE
       SET kind = EXCLUDED.kind,
           interval_minutes = EXCLUDED.interval_minutes,
           scheduled_for = EXCLUDED.scheduled_for,
           completed_at = NULL,
           updated_at = now()
     RETURNING (
       SELECT child_id FROM activity_definition WHERE id = activity_schedule.activity_id
     ) AS child_id`,
    [
      request.params.activityId,
      kind,
      kind === "interval" ? intervalMinutes : null,
      kind === "one_time" ? scheduledFor : null,
      session.userId,
    ],
  );
  if (updated.rowCount !== 1) {
    const memberCanSeeActivity = await pool.query(
      `SELECT 1
       FROM activity_definition AS activity
       JOIN child_membership AS membership ON membership.child_id = activity.child_id
       WHERE activity.id = $1 AND activity.archived_at IS NULL AND membership.user_id = $2`,
      [request.params.activityId, session.userId],
    );
    response
      .status(memberCanSeeActivity.rowCount === 1 ? 403 : 404)
      .json({ error: memberCanSeeActivity.rowCount === 1 ? "Owner or care manager access is required" : "Activity not found" });
    return;
  }
  io.to(childRoom(updated.rows[0].child_id)).emit("timeline:changed");
  response.status(201).json(updated.rows[0]);
});
app.delete("/api/activities/:activityId/schedule", async (request, response) => {
  const session = requireSession(request, response);
  if (!session) return;
  const result = await pool.query(
    `DELETE FROM activity_schedule AS schedule
     USING activity_definition AS activity, child_membership AS membership
     WHERE schedule.activity_id = activity.id
       AND activity.id = $1
       AND membership.child_id = activity.child_id
       AND membership.user_id = $2
       AND membership.role IN ('owner', 'care_manager')
     RETURNING activity.child_id`,
    [request.params.activityId, session.userId],
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
      `WITH inserted AS (INSERT INTO log_comment (log_id, body, created_by) SELECT log.id, $2, $3 FROM activity_log AS log JOIN child_membership AS membership ON membership.child_id = log.child_id WHERE log.id = $1 AND membership.user_id = $3 AND membership.role IN ('owner', 'care_manager', 'caregiver') RETURNING *) SELECT inserted.*, log.child_id FROM inserted JOIN activity_log AS log ON log.id = inserted.log_id`,
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
  const [logs, schedules] = await Promise.all([
    pool.query(
      `SELECT activity.name, log.event_time, log.field_values, log.note, author.display_name,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', portion.kind, 'delivery_method', portion.delivery_method, 'amount_ml', portion.amount_ml, 'duration_minutes', portion.duration_minutes) ORDER BY portion.position) FROM feeding_portion AS portion WHERE portion.log_id = log.id), '[]'::jsonb) AS feeding_portions,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('field_key', field.field_key, 'label', field.label, 'field_type', field.field_type, 'unit', field.unit, 'boolean_true_label', field.boolean_true_label, 'boolean_false_label', field.boolean_false_label) ORDER BY field.id) FROM activity_field_definition AS field WHERE field.activity_id = activity.id AND field.archived_at IS NULL), '[]'::jsonb) AS fields
       FROM activity_log AS log
       JOIN activity_definition AS activity ON activity.id = log.activity_id
       JOIN app_user AS author ON author.id = log.created_by
       WHERE log.child_id = $1
       ORDER BY log.event_time DESC`,
      [request.params.childId],
    ),
    pool.query(
      `SELECT activity.name, schedule.kind, schedule.scheduled_for, schedule.interval_minutes
       FROM activity_schedule AS schedule
       JOIN activity_definition AS activity ON activity.id = schedule.activity_id
       WHERE activity.child_id = $1
         AND activity.archived_at IS NULL
         AND schedule.completed_at IS NULL`,
      [request.params.childId],
    ),
  ]);
  const escape = (value: unknown) =>
    `\"${String(value ?? "").replaceAll('\"', '\"\"')}\"`;
  const readableLogDetails = (row: {
    field_values: Record<string, unknown>;
    feeding_portions: Array<{ kind: string; delivery_method: string; amount_ml: number | null; duration_minutes: number | null }>;
    fields: Array<{
      field_key: string;
      label: string;
      field_type: string;
      unit: string | null;
      boolean_true_label: string | null;
      boolean_false_label: string | null;
    }>;
  }) => {
    const fieldKeys = new Set(row.fields.map((field) => field.field_key));
    const details = row.fields.flatMap((field) => {
      const value = row.field_values[field.field_key];
      if (value === undefined || value === null || value === "") return [];
      const displayValue =
        field.field_type === "boolean"
          ? value
            ? field.boolean_true_label ?? "Yes"
            : field.boolean_false_label ?? "No"
          : `${value}${field.unit ? ` ${field.unit}` : ""}`;
      return [`${field.label}: ${displayValue}`];
    });
    for (const [key, value] of Object.entries(row.field_values)) {
      if (!fieldKeys.has(key)) details.push(`${key.replaceAll("_", " ")}: ${value}`);
    }
    details.push(
      ...row.feeding_portions.map((portion) => {
        const kind = portion.kind === "breast_milk" ? "Breast milk" : "Formula";
        const delivery = portion.delivery_method === "breastfeeding" ? "Breastfeeding" : "Bottle";
        return portion.delivery_method === "breastfeeding"
          ? `${kind} · ${delivery}: ${portion.duration_minutes} min`
          : `${kind} · ${delivery}: ${portion.amount_ml} ml`;
      }),
    );
    return details.join(" · ");
  };
  const rows = [
    "record_type,activity,event_time,details,values_json,note,created_by",
    ...logs.rows.map((row) => {
      const values = {
        ...row.field_values,
        ...(row.feeding_portions.length ? { portions: row.feeding_portions } : {}),
      };
      return [
        "logged",
        row.name,
        row.event_time.toISOString(),
        readableLogDetails(row),
        JSON.stringify(values),
        row.note,
        row.display_name,
      ]
        .map(escape)
        .join(",");
    }),
    ...schedules.rows.map((row) =>
      [
        "upcoming",
        row.name,
        row.scheduled_for?.toISOString() ??
          `after ${row.interval_minutes} minutes`,
        row.kind === "interval" ? `Every ${row.interval_minutes} minutes` : "One-time reminder",
        JSON.stringify({
          kind: row.kind,
          interval_minutes: row.interval_minutes,
          scheduled_for: row.scheduled_for,
        }),
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
  const activityValues =
    typeof request.query.activities === "string"
      ? request.query.activities.split(",")
      : [];
  const activityIds = activityValues.filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
  );
  if (!activityIds.length) {
    response.status(400).send("Select at least one activity");
    return;
  }
  const period =
    request.query.period === "last_24_hours"
      ? "last_24_hours"
      : "calendar_day";
  const includeHistory = request.query.history === "true";
  const today = new Date().toISOString().slice(0, 10);
  const historyStart =
    typeof request.query.historyStart === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(request.query.historyStart)
      ? request.query.historyStart
      : today;
  const historyEnd =
    typeof request.query.historyEnd === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(request.query.historyEnd)
      ? request.query.historyEnd
      : today;
  if (historyStart > historyEnd) {
    response.status(400).send("History start must be before history end");
    return;
  }
  const locale = request.query.locale === "he" ? "he" : "en";
  const report = await pool.query(
    `WITH child_context AS (
       SELECT name, timezone FROM child WHERE id = $1
     ),
     selected_activities AS (
       SELECT id, name, kind, color
       FROM activity_definition
       WHERE child_id = $1 AND id = ANY($2::uuid[]) AND archived_at IS NULL
     ),
     log_metrics AS (
       SELECT log.activity_id,
         (log.event_time AT TIME ZONE child_context.timezone)::date AS local_date,
         log.event_time,
         portions.portion_count,
         portions.total_amount_ml,
         portions.total_breastfeeding_minutes,
         CASE WHEN portions.total_amount_ml > 0 THEN 1 ELSE 0 END AS bottle_fed_count,
         CASE WHEN portions.total_breastfeeding_minutes > 0 THEN 1 ELSE 0 END AS breast_fed_count
       FROM activity_log AS log
       CROSS JOIN child_context
       JOIN selected_activities AS activity ON activity.id = log.activity_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS portion_count,
           COALESCE(SUM(portion.amount_ml), 0)::float8 AS total_amount_ml,
           COALESCE(SUM(portion.duration_minutes), 0)::float8 AS total_breastfeeding_minutes
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
         COALESCE(SUM(total_breastfeeding_minutes), 0)::float8 AS total_breastfeeding_minutes,
         COALESCE(SUM(bottle_fed_count), 0)::int AS bottle_fed_count,
         COALESCE(SUM(breast_fed_count), 0)::int AS breast_fed_count
       FROM log_metrics
       GROUP BY activity_id, local_date
     ),
     excluded_average_days AS (
       SELECT DISTINCT series.local_date::date AS local_date
       FROM care_gap
       CROSS JOIN child_context
       CROSS JOIN LATERAL generate_series(
         (care_gap.starts_at AT TIME ZONE child_context.timezone)::date,
         ((care_gap.ends_at AT TIME ZONE child_context.timezone) - INTERVAL '1 microsecond')::date,
         INTERVAL '1 day'
       ) AS series(local_date)
       WHERE care_gap.child_id = $1 AND NOT care_gap.include_in_averages
     ),
     average_metrics AS (
       SELECT activity_id,
         AVG(count)::float8 AS count,
         AVG(portion_count)::float8 AS portion_count,
         AVG(total_amount_ml)::float8 AS total_amount_ml,
         AVG(total_breastfeeding_minutes)::float8 AS total_breastfeeding_minutes,
         SUM(total_amount_ml) / NULLIF(SUM(bottle_fed_count), 0)::float8 AS average_amount_ml,
         SUM(total_breastfeeding_minutes) / NULLIF(SUM(breast_fed_count), 0)::float8 AS average_breastfeeding_minutes
       FROM daily
       LEFT JOIN excluded_average_days ON excluded_average_days.local_date = daily.local_date
       WHERE excluded_average_days.local_date IS NULL
       GROUP BY activity_id
     ),
     calendar_day_metrics AS (
       SELECT daily.* FROM daily CROSS JOIN child_context
       WHERE daily.local_date = (now() AT TIME ZONE child_context.timezone)::date
     ),
     last_24_hours_metrics AS (
       SELECT activity_id,
         COUNT(*)::int AS count,
         COALESCE(SUM(portion_count), 0)::int AS portion_count,
         COALESCE(SUM(total_amount_ml), 0)::float8 AS total_amount_ml,
         COALESCE(SUM(total_breastfeeding_minutes), 0)::float8 AS total_breastfeeding_minutes,
         SUM(total_amount_ml) / NULLIF(SUM(bottle_fed_count), 0)::float8 AS average_amount_ml,
         SUM(total_breastfeeding_minutes) / NULLIF(SUM(breast_fed_count), 0)::float8 AS average_breastfeeding_minutes
       FROM log_metrics
       WHERE event_time >= now() - INTERVAL '24 hours'
       GROUP BY activity_id
     ),
     history_metrics AS (
       SELECT daily.activity_id,
         jsonb_agg(
           jsonb_build_object(
             'date', daily.local_date,
             'count', daily.count,
             'portion_count', daily.portion_count,
             'total_amount_ml', daily.total_amount_ml,
             'total_breastfeeding_minutes', daily.total_breastfeeding_minutes,
             'average_amount_ml', daily.total_amount_ml / NULLIF(daily.bottle_fed_count, 0)::float8,
             'average_breastfeeding_minutes', daily.total_breastfeeding_minutes / NULLIF(daily.breast_fed_count, 0)::float8,
             'excluded_from_average', excluded_average_days.local_date IS NOT NULL
           ) ORDER BY daily.local_date DESC
         ) AS days
       FROM daily
       LEFT JOIN excluded_average_days ON excluded_average_days.local_date = daily.local_date
       WHERE daily.local_date BETWEEN $3::date AND $4::date
       GROUP BY daily.activity_id
     )
     SELECT child_context.name AS child_name, activity.id, activity.name, activity.kind,
       COALESCE(average_metrics.count, 0)::float8 AS average_count,
       COALESCE(average_metrics.portion_count, 0)::float8 AS average_portion_count,
       COALESCE(average_metrics.total_amount_ml, 0)::float8 AS average_total_amount_ml,
       COALESCE(average_metrics.total_breastfeeding_minutes, 0)::float8 AS average_total_breastfeeding_minutes,
       average_metrics.average_amount_ml,
       average_metrics.average_breastfeeding_minutes,
       COALESCE(calendar_day_metrics.count, 0)::int AS calendar_day_count,
       COALESCE(calendar_day_metrics.portion_count, 0)::int AS calendar_day_portion_count,
       COALESCE(calendar_day_metrics.total_amount_ml, 0)::float8 AS calendar_day_total_amount_ml,
       COALESCE(calendar_day_metrics.total_breastfeeding_minutes, 0)::float8 AS calendar_day_total_breastfeeding_minutes,
       calendar_day_metrics.total_amount_ml / NULLIF(calendar_day_metrics.bottle_fed_count, 0)::float8 AS calendar_day_average_amount_ml,
       calendar_day_metrics.total_breastfeeding_minutes / NULLIF(calendar_day_metrics.breast_fed_count, 0)::float8 AS calendar_day_average_breastfeeding_minutes,
       COALESCE(last_24_hours_metrics.count, 0)::int AS last_24_hours_count,
       COALESCE(last_24_hours_metrics.portion_count, 0)::int AS last_24_hours_portion_count,
       COALESCE(last_24_hours_metrics.total_amount_ml, 0)::float8 AS last_24_hours_total_amount_ml,
       COALESCE(last_24_hours_metrics.total_breastfeeding_minutes, 0)::float8 AS last_24_hours_total_breastfeeding_minutes,
       last_24_hours_metrics.average_amount_ml AS last_24_hours_average_amount_ml,
       last_24_hours_metrics.average_breastfeeding_minutes AS last_24_hours_average_breastfeeding_minutes,
       COALESCE(history_metrics.days, '[]'::jsonb) AS history
     FROM selected_activities AS activity
     CROSS JOIN child_context
     LEFT JOIN average_metrics ON average_metrics.activity_id = activity.id
     LEFT JOIN calendar_day_metrics ON calendar_day_metrics.activity_id = activity.id
     LEFT JOIN last_24_hours_metrics ON last_24_hours_metrics.activity_id = activity.id
     LEFT JOIN history_metrics ON history_metrics.activity_id = activity.id
     ORDER BY activity.name`,
    [request.params.childId, activityIds, historyStart, historyEnd],
  );
  if (!report.rowCount) {
    response.status(400).send("No selected activities are available");
    return;
  }
  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  const words =
    locale === "he"
      ? {
          title: "דפוסי טיפול",
          average: "ממוצע",
          today: "היום, החל מ־00:00",
          last24: "24 השעות האחרונות",
          records: "רשומות",
          feedings: "האכלות",
          portions: "מנות",
          total: "סך החלב",
          perFeed: "ממוצע להאכלה",
          averageBreastfeeding: "ממוצע זמן הנקה",
          history: "היסטוריה",
          noHistory: "אין נתונים בטווח שנבחר",
          print: "הדפסה / שמירה כ־PDF",
        }
      : {
          title: "Care patterns",
          average: "Average",
          today: "Today, from 00:00",
          last24: "Last 24 hours",
          records: "Records",
          feedings: "Feedings",
          portions: "Portions",
          total: "Total milk",
          perFeed: "Average per feed",
          averageBreastfeeding: "Average breastfeeding time",
          history: "History",
          noHistory: "No records in the selected range",
          print: "Print / Save as PDF",
        };
  const formatNumber = (value: unknown, nullValue = "—") => {
    if (value === null || value === undefined) return nullValue;
    const number = Number(value);
    return number < 10 ? number.toFixed(1) : number.toFixed(0);
  };
  const formatMilliliters = (value: unknown) => {
    const formatted = formatNumber(value);
    return formatted === "—" ? formatted : `${formatted} ml`;
  };
  const formatMinutes = (value: unknown) => {
    const formatted = formatNumber(value);
    return formatted === "—" ? formatted : `${formatted} min`;
  };
  const metricList = (row: Record<string, unknown>, prefix: string) => {
    const feeding = row.kind === "feeding";
    const averageAmountKey =
      prefix === "average"
        ? "average_amount_ml"
        : `${prefix}_average_amount_ml`;
    const averageBreastfeedingKey =
      prefix === "average"
        ? "average_breastfeeding_minutes"
        : `${prefix}_average_breastfeeding_minutes`;
    const metrics = [
      `<li><span>${words[feeding ? "feedings" : "records"]}</span><strong>${formatNumber(row[`${prefix}_count`])}</strong></li>`,
    ];
    if (feeding) {
      metrics.push(
        `<li><span>${words.portions}</span><strong>${formatNumber(row[`${prefix}_portion_count`])}</strong></li>`,
        `<li><span>${words.total}</span><strong>${formatMilliliters(row[`${prefix}_total_amount_ml`])}</strong></li>`,
        `<li><span>${words.perFeed}</span><strong>${formatMilliliters(row[averageAmountKey])}</strong></li>`,
        `<li><span>${words.averageBreastfeeding}</span><strong>${formatMinutes(row[averageBreastfeedingKey])}</strong></li>`,
      );
    }
    return `<ul class="metrics">${metrics.join("")}</ul>`;
  };
  const historySections = includeHistory
    ? report.rows
        .map((row) => {
          const history = row.history as Array<Record<string, unknown>>;
          const rows = history
            .map((day) => {
              const date = new Intl.DateTimeFormat(
                locale === "he" ? "he-IL" : "en-US",
                { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" },
              ).format(new Date(`${String(day.date).slice(0, 10)}T12:00:00Z`));
              const feeding = row.kind === "feeding";
              return `<tr><th>${escapeHtml(date)}</th><td>${formatNumber(day.count)}</td>${feeding ? `<td>${formatNumber(day.portion_count)}</td><td>${formatMilliliters(day.total_amount_ml)}</td><td>${formatMilliliters(day.average_amount_ml)}</td><td>${formatMinutes(day.average_breastfeeding_minutes)}</td>` : ""}</tr>`;
            })
            .join("");
          const headings = row.kind === "feeding"
            ? `<tr><th>${locale === "he" ? "תאריך" : "Date"}</th><th>${words.feedings}</th><th>${words.portions}</th><th>${words.total}</th><th>${words.perFeed}</th><th>${words.averageBreastfeeding}</th></tr>`
            : `<tr><th>${locale === "he" ? "תאריך" : "Date"}</th><th>${words.records}</th></tr>`;
          return `<section class="history"><h3>${escapeHtml(row.name)} — ${words.history}</h3><table><thead>${headings}</thead><tbody>${rows || `<tr><td colspan="5">${words.noHistory}</td></tr>`}</tbody></table></section>`;
        })
        .join("")
    : "";
  const currentPrefix = period === "last_24_hours" ? "last_24_hours" : "calendar_day";
  const currentLabel = period === "last_24_hours" ? words.last24 : words.today;
  const summarySections = report.rows
    .map(
      (row) =>
        `<section class="activity"><h2>${escapeHtml(row.name)}</h2><h3>${words.average}</h3>${metricList(row, "average")}<h3>${currentLabel}</h3>${metricList(row, currentPrefix)}</section>`,
    )
    .join("");
  response
    .type("html")
    .send(
      `<!doctype html><html dir="${locale === "he" ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${escapeHtml(report.rows[0].child_name)} ${words.title}</title><style>body{font:14px system-ui;margin:38px;color:#27211d;background:#fffcf8}h1{margin:0 0 4px;font-size:30px}h2{margin:0;font-size:20px}h3{margin:20px 0 5px;color:#6e655d;font-size:14px}.generated{margin:0;color:#756d65}.activity,.history{break-inside:avoid;margin-top:28px;padding-top:22px;border-top:1px solid #ded7cf}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:0;padding:0;list-style:none}.metrics li{padding:10px 0;border-bottom:1px solid #e4ddd5}.metrics span{display:block;color:#756d65;font-size:12px}.metrics strong{display:block;margin-top:5px;font-size:18px}table{width:100%;border-collapse:collapse}th,td{padding:9px;text-align:start;border-bottom:1px solid #e2dbd3}thead{background:#f4efe9}@media print{body{margin:16px}.activity,.history{break-inside:avoid}}</style></head><body><h1>${escapeHtml(report.rows[0].child_name)} — ${words.title}</h1><p class="generated">${escapeHtml(new Date().toLocaleString(locale === "he" ? "he-IL" : "en-US"))}</p>${summarySections}${historySections}</body></html>`,
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
httpServer.listen(port, () => console.log(`Feedme API listening on ${port}`));

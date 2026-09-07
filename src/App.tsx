import { FormEvent, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { AnalyticsView } from "./AnalyticsView";
import { NotesPage } from "./NotesPage";
import { CommentsPage } from "./CommentsPage";
import { RemindersPage } from "./RemindersPage";
import {
  Bell,
  Check,
  Clock3,
  Droplets,
  FileDown,
  HeartPulse,
  Languages,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Utensils,
  Users,
  X,
} from "lucide-react";

type Field = {
  id: string;
  field_key: string;
  label: string;
  field_type: "text" | "number" | "boolean" | "select" | "duration";
  unit?: string;
  options: string[];
};
type Activity = {
  id: string;
  name: string;
  kind: "feeding" | "diaper" | "custom";
  color: string;
  fields: Field[];
};
type Event = {
  id: string;
  activity_id: string;
  event_time: string;
  field_values: Record<string, unknown>;
  note?: string;
  activity_name: string;
  kind: Activity["kind"];
  color: string;
  created_by: string;
  created_by_id: string;
};
type Reminder = {
  id: string;
  kind: "interval" | "one_time";
  interval_minutes?: number;
  scheduled_for?: string;
  title: string;
  activity_id?: string;
};
type ActivityAnalytics = {
  activity_id: string;
  count: number;
  average_hours: number | null;
  median_hours: number | null;
  interval_warning: boolean;
  fields: {
    key: string;
    label: string;
    unit?: string;
    count: number;
    average: number | null;
  }[];
};
type Dashboard = {
  role: "owner" | "caregiver" | "viewer";
  timeline: Event[];
  activities: Activity[];
  reminders: Reminder[];
  gaps: { starts_at: string; ends_at: string }[];
  analytics: ActivityAnalytics[];
};
type Child = { id: string; name: string; timezone: string; role: string };
type User = {
  id: string;
  email: string;
  display_name: string;
  locale: "en" | "he";
};
type Note = {
  id: string;
  body: string;
  visibility: "private" | "shared";
  created_by: string;
  created_by_name: string;
};
type Comment = {
  id: string;
  body: string;
  created_by: string;
  created_by_name: string;
};
type Panel =
  | "activity"
  | "field"
  | "reminder"
  | "gap"
  | "notes"
  | "invite"
  | "children"
  | null;

const txt = {
  en: {
    timeline: "Timeline",
    insights: "Insights",
    upcoming: "Upcoming",
    log: "Log care",
    manage: "Manage care",
    notes: "Notes",
    save: "Save",
  },
  he: {
    timeline: "ציר זמן",
    insights: "תובנות",
    upcoming: "הבא",
    log: "תיעוד טיפול",
    manage: "ניהול טיפול",
    notes: "הערות",
    save: "שמירה",
  },
};
const hebrewLabels: Record<string, string> = {
  "LIVE SHARED TIMELINE": "ציר זמן משותף חי",
  "Last feeding": "האכלה אחרונה",
  "Next expected": "הצפוי הבא",
  "from its reminder": "לפי התזכורת",
  "Care today": "טיפול היום",
  "live from PostgreSQL": "נתונים חיים",
  "Care history": "היסטוריית טיפול",
  "Children & people": "ילדים ואנשים",
  "Invite caregiver": "הזמנת מטפל",
  "Declare care gap": "הכרזת הפסקת טיפול",
  "Exclude a deliberate tracking break.": "החרגת הפסקה מכוונת מהמעקב.",
  "QUICK LOG": "תיעוד מהיר",
  "What happened?": "מה קרה?",
  When: "מתי",
  Note: "הערה",
  "Optional context for everyone": "הקשר אופציונלי לכל המטפלים",
  Save: "שמירה",
  "Custom activity": "פעילות מותאמת",
  "Passive reminder": "תזכורת פסיבית",
  Reminder: "תזכורת",
  "Create activity": "יצירת פעילות",
  "Add a field": "הוספת שדה",
  "Save reminder": "שמירת תזכורת",
  Comments: "תגובות",
  "Save comment": "שמירת תגובה",
  "Delete this care record": "מחיקת רשומת טיפול",
  "Shared with caregivers": "משותף עם מטפלים",
  "Only me": "רק אני",
  "New note": "הערה חדשה",
  "Save note": "שמירת הערה",
  Edit: "עריכה",
  Delete: "מחיקה",
  "Care gaps protect your routine data.": "הפסקות טיפול מגינות על נתוני השגרה.",
};
const localDateTime = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const clock = (value: string, locale = "en") =>
  new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
const icon = (kind: Activity["kind"]) =>
  kind === "feeding" ? (
    <Utensils size={17} />
  ) : kind === "diaper" ? (
    <Droplets size={17} />
  ) : (
    <HeartPulse size={17} />
  );
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => ({ error: "Request failed" }))).error,
    );
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
function eventDetail(event: Event) {
  const values = Object.entries(event.field_values)
    .filter(([, value]) => value !== "" && value !== false && value != null)
    .map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`);
  return values.join(" · ") || "Care activity";
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [child, setChild] = useState<Child | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auth, setAuth] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("alex@nurture.local");
  const [password, setPassword] = useState("nurture-demo");
  const [name, setName] = useState("");
  const [page, setPage] = useState<"timeline" | "insights">("timeline");
  const [routePath, setRoutePath] = useState(() => location.pathname || "/");
  const [panel, setPanel] = useState<Panel>(null);
  const [homeOpen, setHomeOpen] = useState(false);
  const [createChildOpen, setCreateChildOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activityId, setActivityId] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [note, setNote] = useState("");
  const [at, setAt] = useState(localDateTime());
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Event | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const t = txt[user?.locale ?? "en"];
  const owner = dash?.role === "owner";
  const write = dash?.role !== "viewer";
  const events = dash?.timeline ?? [];
  const feed = events.filter((event) => event.kind === "feeding");
  const current = dash?.activities.find((item) => item.id === activityId);
  const lastFeed = feed[0];
  const feedReminder = dash?.reminders.find(
    (item) =>
      item.kind === "interval" && item.activity_id === lastFeed?.activity_id,
  );
  const expected = useMemo(
    () =>
      lastFeed && feedReminder?.interval_minutes
        ? new Date(
            new Date(lastFeed.event_time).getTime() +
              feedReminder.interval_minutes * 60_000,
          )
        : null,
    [lastFeed?.id, feedReminder?.id],
  );
  const navigate = (path: string, replace = false) => {
    if (location.pathname !== path)
      history[replace ? "replaceState" : "pushState"]({}, "", path);
    setRoutePath(path);
  };
  const load = async () => {
    const me = await api<User>("/api/me");
    const list = await api<Child[]>("/api/children");
    setUser(me);
    setChildren(list);
    setChild(
      (old) => list.find((item) => item.id === old?.id) ?? list[0] ?? null,
    );
  };
  const loadDash = async (id: string) => {
    const data = await api<Dashboard>(`/api/children/${id}/dashboard`);
    setDash(data);
    setActivityId((old) =>
      data.activities.some((activity) => activity.id === old)
        ? old
        : (data.activities[0]?.id ?? ""),
    );
  };
  const loadNotes = async () => {
    if (child) setNotes(await api<Note[]>(`/api/children/${child.id}/notes`));
  };
  useEffect(() => {
    load()
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const onPopState = () => setRoutePath(location.pathname || "/");
    addEventListener("popstate", onPopState);
    return () => removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!user) return;
    if (routePath === "/") {
      history.replaceState({}, "", "/children");
      setRoutePath("/children");
      return;
    }
    const match = routePath.match(/^\/children\/([^/]+)$/);
    if (match) {
      const routeChild = children.find((item) => item.id === match[1]);
      if (routeChild) setChild(routeChild);
      else if (children.length) {
        history.replaceState({}, "", "/children");
        setRoutePath("/children");
      }
    }
  }, [user?.id, routePath, children]);
  useEffect(() => {
    if (child)
      loadDash(child.id).catch((cause: Error) => setError(cause.message));
    else setDash(null);
  }, [child?.id]);
  useEffect(() => {
    if (!user) return;
    document.documentElement.lang = user.locale;
    document.documentElement.dir = user.locale === "he" ? "rtl" : "ltr";
    const token = new URLSearchParams(location.search).get("invite");
    if (token)
      api(`/api/invitations/${token}/accept`, { method: "POST" })
        .then(load)
        .catch((cause: Error) => setError(cause.message));
  }, [user?.id, user?.locale]);
  useEffect(() => {
    if (user?.locale !== "he") return;
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    const texts: Text[] = [];
    while (walker.nextNode()) texts.push(walker.currentNode as Text);
    texts.forEach((text) => {
      const translation = hebrewLabels[text.data.trim()];
      if (translation)
        text.data = text.data.replace(text.data.trim(), translation);
    });
  }, [
    user?.locale,
    page,
    panel,
    logOpen,
    selected?.id,
    dash?.timeline.length,
    notes.length,
  ]);
  useEffect(() => {
    if (!child || !user) return;
    const socket = io({ withCredentials: true });
    socket.emit("child:join", child.id);
    socket.on("timeline:changed", () => loadDash(child.id));
    socket.on("notes:changed", loadNotes);
    return () => {
      socket.close();
    };
  }, [child?.id, user?.id]);
  useEffect(() => {
    const closeOnBackdrop = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (target?.classList.contains("modal-backdrop")) {
        setPanel(null);
        setLogOpen(false);
        setSelected(null);
        setCreateChildOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnBackdrop);
    return () => document.removeEventListener("mousedown", closeOnBackdrop);
  }, []);
  useEffect(() => {
    if (panel !== "children") return;
    setPanel(null);
    navigate("/children");
  }, [panel]);
  useEffect(() => {
    if (!current) return;
    const defaults: Record<string, unknown> = {};
    current.fields.forEach((field) => {
      defaults[field.field_key] =
        field.field_type === "boolean"
          ? false
          : field.field_type === "select"
            ? (field.options[0] ?? "")
            : "";
    });
    if (current.kind === "feeding") {
      defaults.amount = "120";
      defaults.method = "Bottle";
    }
    if (current.kind === "diaper") defaults.type = "Wet";
    setValues(defaults);
  }, [current?.id]);
  async function login(event: FormEvent) {
    event.preventDefault();
    try {
      if (auth === "register")
        await api("/api/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            displayName: name,
            locale: "en",
          }),
        });
      else
        await api("/api/auth/sign-in", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function createChild(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const form = new FormData(event.currentTarget);
      await api("/api/children", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          timezone: form.get("timezone"),
          birthDate: form.get("birthDate") || null,
        }),
      });
      setCreateChildOpen(false);
      setPanel(null);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function renameChild(item: Child) {
    const name = prompt("Child's name", item.name);
    if (name === null || !name.trim()) return;
    await api(`/api/children/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    });
    await load();
  }
  async function deleteChild(item: Child) {
    if (
      !confirm(
        `Delete ${item.name}'s profile? Its existing care history will be archived.`,
      )
    )
      return;
    try {
      await api(`/api/children/${item.id}`, { method: "DELETE" });
      if (child?.id === item.id) setChild(null);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function addLog(event: FormEvent) {
    event.preventDefault();
    if (!child || !current) return;
    const fieldValues = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        current.fields.find((field) => field.field_key === key)?.field_type ===
          "number" || key === "amount"
          ? Number(value)
          : value,
      ]),
    );
    await api(`/api/children/${child.id}/logs`, {
      method: "POST",
      body: JSON.stringify({
        activityId,
        eventTime: new Date(at).toISOString(),
        eventTimezone: child.timezone,
        fieldValues,
        note,
      }),
    });
    setNote("");
    setLogOpen(false);
  }
  async function createActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!child) return;
    const form = new FormData(event.currentTarget);
    const field = String(form.get("field") ?? "");
    await api(`/api/children/${child.id}/activities`, {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        color: "#8b68c8",
        fields: field
          ? [
              {
                key: field.toLowerCase().replaceAll(" ", "_"),
                label: field,
                type: form.get("type"),
                unit: form.get("unit") || null,
                options: String(form.get("options") ?? "")
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
                metrics: ["average", "trend"],
              },
            ]
          : [],
      }),
    });
    setPanel(null);
    await loadDash(child.id);
  }
  async function archiveActivity(id: string) {
    if (
      !child ||
      !confirm(
        "Remove this activity from future logging? Existing history stays in exports.",
      )
    )
      return;
    await api(`/api/activities/${id}`, { method: "DELETE" });
    await loadDash(child.id);
  }
  async function addField(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!child) return;
    const form = new FormData(event.currentTarget);
    const field = String(form.get("field"));
    await api(`/api/activities/${form.get("activityId")}/fields`, {
      method: "POST",
      body: JSON.stringify({
        fieldKey: field.toLowerCase().replaceAll(" ", "_"),
        label: field,
        fieldType: form.get("type"),
        unit: form.get("unit") || null,
        options: String(form.get("options") ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        metrics: ["average", "trend"],
      }),
    });
    setPanel(null);
    await loadDash(child.id);
  }
  async function remind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!child) return;
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind"));
    const when = String(form.get("when"));
    if (kind === "one_time" && !when)
      throw new Error("Choose a date and time.");
    await api(`/api/children/${child.id}/reminders`, {
      method: "POST",
      body: JSON.stringify({
        title: form.get("title"),
        activityId: form.get("activityId") || null,
        kind,
        intervalMinutes:
          kind === "interval" ? Number(form.get("hours")) * 60 : null,
        scheduledFor: kind === "one_time" ? new Date(when).toISOString() : null,
      }),
    });
    setPanel(null);
    await loadDash(child.id);
  }
  async function updateReminder(item: Reminder) {
    if (!child) return;
    const title = prompt("Reminder title", item.title);
    if (title === null || !title.trim()) return;
    const schedule =
      item.kind === "interval"
        ? prompt(
            "Repeat every how many hours?",
            String((item.interval_minutes ?? 60) / 60),
          )
        : prompt(
            "Date and time (YYYY-MM-DDTHH:MM)",
            item.scheduled_for
              ? item.scheduled_for.slice(0, 16)
              : localDateTime(),
          );
    if (schedule === null || !schedule.trim()) return;
    await api(`/api/reminders/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title,
        activityId: item.activity_id ?? null,
        kind: item.kind,
        intervalMinutes:
          item.kind === "interval" ? Number(schedule) * 60 : null,
        scheduledFor:
          item.kind === "one_time" ? new Date(schedule).toISOString() : null,
      }),
    });
    await loadDash(child.id);
  }
  async function completeReminder(item: Reminder) {
    if (!child) return;
    await api(`/api/reminders/${item.id}/complete`, { method: "POST" });
    await loadDash(child.id);
  }
  async function deleteReminder(item: Reminder) {
    if (!child || !confirm("Delete this reminder?")) return;
    await api(`/api/reminders/${item.id}`, { method: "DELETE" });
    await loadDash(child.id);
  }
  async function gap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!child) return;
    const form = new FormData(event.currentTarget);
    await api(`/api/children/${child.id}/gaps`, {
      method: "POST",
      body: JSON.stringify({
        startsAt: new Date(String(form.get("start"))).toISOString(),
        endsAt: new Date(String(form.get("end"))).toISOString(),
        reason: form.get("reason"),
      }),
    });
    setPanel(null);
    await loadDash(child.id);
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!child) return;
    const form = new FormData(event.currentTarget);
    const result = await api<{ acceptUrl: string }>(
      `/api/children/${child.id}/invitations`,
      {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          role: form.get("role"),
        }),
      },
    );
    setInviteUrl(`${location.origin}${result.acceptUrl}`);
  }
  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!child) return;
    const form = new FormData(event.currentTarget);
    await api(`/api/children/${child.id}/notes`, {
      method: "POST",
      body: JSON.stringify({
        body: form.get("body"),
        visibility: form.get("visibility"),
      }),
    });
    event.currentTarget.reset();
    await loadNotes();
  }
  async function editNote(item: Note) {
    const body = prompt("Edit note", item.body);
    if (body === null) return;
    await api(`/api/notes/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ body, visibility: item.visibility }),
    });
    await loadNotes();
  }
  async function deleteNote(item: Note) {
    if (!confirm("Delete this note?")) return;
    await api(`/api/notes/${item.id}`, { method: "DELETE" });
    await loadNotes();
  }
  async function openComments(item: Event) {
    setSelected(item);
    setComments(await api<Comment[]>(`/api/logs/${item.id}/comments`));
  }
  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    await api(`/api/logs/${selected.id}/comments`, {
      method: "POST",
      body: JSON.stringify({ body: comment }),
    });
    setComment("");
    setComments(await api<Comment[]>(`/api/logs/${selected.id}/comments`));
  }
  async function editComment(item: Comment) {
    if (!selected) return;
    const body = prompt("Edit comment", item.body);
    if (body === null) return;
    await api(`/api/comments/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ body }),
    });
    setComments(await api<Comment[]>(`/api/logs/${selected.id}/comments`));
  }
  async function deleteComment(item: Comment) {
    if (!selected || !confirm("Delete this comment?")) return;
    await api(`/api/comments/${item.id}`, { method: "DELETE" });
    setComments(await api<Comment[]>(`/api/logs/${selected.id}/comments`));
  }
  async function deleteLog() {
    if (!selected || !child || !confirm("Permanently delete this care record?"))
      return;
    await api(`/api/logs/${selected.id}`, { method: "DELETE" });
    setSelected(null);
    await loadDash(child.id);
  }
  const setLocale = async () => {
    if (!user) return;
    const locale = user.locale === "en" ? "he" : "en";
    await api("/api/me/locale", {
      method: "PUT",
      body: JSON.stringify({ locale }),
    });
    setUser({ ...user, locale });
  };
  if (loading) return <div className="loading-screen">Loading Nurture…</div>;
  if (!user)
    return (
      <div className="sign-in-shell">
        <form className="sign-in" onSubmit={login}>
          <div className="brand">
            <span className="brand-mark">n</span>
            <span>Nurture</span>
          </div>
          <p className="eyebrow">SHARED CHILD CARE</p>
          <h1>
            {auth === "sign-in" ? "Welcome back." : "Start your family space."}
          </h1>
          {auth === "register" && (
            <label>
              Name
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
            />
          </label>
          <label>
            Password
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              minLength={8}
              required
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <button className="primary submit">
            {auth === "sign-in" ? "Sign in" : "Create account"}
          </button>
          <button
            className="text-button auth-switch"
            type="button"
            onClick={() => setAuth(auth === "sign-in" ? "register" : "sign-in")}
          >
            {auth === "sign-in"
              ? "Need an account? Register"
              : "Already have an account? Sign in"}
          </button>
          <a className="google-link" href="/api/auth/google">
            Continue with Google
          </a>
          <small>Local sample: alex@nurture.local / nurture-demo</small>
        </form>
      </div>
    );
  if (routePath === "/children")
    return (
      <ChildrenHome
        user={user}
        children={children}
        error={error}
        createChildOpen={createChildOpen}
        onCreate={() => {
          setError("");
          setCreateChildOpen(true);
        }}
        onCloseCreate={() => setCreateChildOpen(false)}
        onCreateChild={createChild}
        onSelectChild={(item) => {
          setChild(item);
          navigate(`/children/${item.id}`);
        }}
        onEditChild={renameChild}
        onDeleteChild={deleteChild}
        onClose={() => {
          if (child) navigate(`/children/${child.id}`);
        }}
        onSignOut={() =>
          api("/api/auth/sign-out", { method: "POST" }).then(() => {
            setUser(null);
            setChildren([]);
            setChild(null);
            navigate("/", true);
          })
        }
      />
    );
  if (!child || homeOpen)
    return (
      <Home
        user={user}
        error={error}
        createChildOpen={createChildOpen}
        onCreate={() => {
          setError("");
          setCreateChildOpen(true);
        }}
        onCloseCreate={() => setCreateChildOpen(false)}
        onCreateChild={createChild}
        onSignOut={() =>
          api("/api/auth/sign-out", { method: "POST" }).then(() => {
            setUser(null);
            setChildren([]);
            setChild(null);
            setHomeOpen(false);
          })
        }
      />
    );
  if (!dash) return <div className="loading-screen">Loading family space…</div>;
  if ((() => page === "insights")())
    return (
      <AnalyticsView
        child={child}
        dashboard={dash}
        onBack={() => setPage("timeline")}
      />
    );
  if (panel === "reminder")
    return (
      <RemindersPage
        reminders={dash.reminders}
        activities={dash.activities}
        owner={owner}
        onClose={() => setPanel(null)}
        onCreate={remind}
        onEdit={updateReminder}
        onComplete={completeReminder}
        onDelete={deleteReminder}
      />
    );
  if (panel === "notes")
    return (
      <NotesPage
        notes={notes}
        userId={user.id}
        write={write}
        onClose={() => setPanel(null)}
        onCreate={addNote}
        onEdit={editNote}
        onDelete={deleteNote}
      />
    );
  if ((() => selected)())
    return (
      <CommentsPage
        item={selected!}
        comments={comments}
        comment={comment}
        userId={user.id}
        write={write}
        canDeleteLog={owner || selected!.created_by_id === user.id}
        onClose={() => setSelected(null)}
        onChange={setComment}
        onCreate={addComment}
        onEdit={editComment}
        onDeleteComment={deleteComment}
        onDeleteLog={deleteLog}
      />
    );
  return (
    <main className={`app-shell ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`}>
      <button
        className="sidebar-scrim"
        aria-label="Close navigation"
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">n</span>
          <span>Nurture</span>
        </div>
        <label className="child-switch">
          <span className="avatar">{child.name[0]}</span>
          <span>
            <strong>{child.name}</strong>
            <small>{child.timezone}</small>
          </span>
          <select
            value={child.id}
            onChange={(event) =>
              setChild(
                children.find((item) => item.id === event.target.value) ??
                  child,
              )
            }
          >
            {children.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <nav onClickCapture={() => setMobileSidebarOpen(false)}>
          <button className="nav-active">
            <Clock3 size={18} />
            {t.timeline}
          </button>
          <button onClick={() => setPage("insights")}>
            <Sparkles size={18} />
            {t.insights}
          </button>
          <button onClick={() => setPanel("reminder")}>
            <Bell size={18} />
            {t.upcoming}
            <em>{dash.reminders.length}</em>
          </button>
        </nav>
        <div className="sidebar-bottom" onClickCapture={() => setMobileSidebarOpen(false)}>
          <button onClick={() => setPanel("activity")}>
            <Settings2 size={18} />
            {t.manage}
          </button>
          <button onClick={() => setPanel("children")}>
            <Users size={18} />
            Children & people
          </button>
          <div className="user">
            <span className="avatar you">{user.display_name[0]}</span>
            <span>
              <strong>{user.display_name}</strong>
              <small>{dash.role}</small>
            </span>
            <button
              onClick={() =>
                api("/api/auth/sign-out", { method: "POST" }).then(() => {
                  setUser(null);
                  setChildren([]);
                  setChild(null);
                })
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div>
            <button
              className="mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileSidebarOpen}
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>
            <p className="eyebrow">LIVE SHARED TIMELINE</p>
            <h1>{child.name}’s timeline</h1>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              title="Export CSV"
              onClick={() =>
                window.open(`/api/children/${child.id}/export.csv`, "_blank")
              }
            >
              <FileDown size={18} />
            </button>
            <button
              className="icon-button"
              title="English / עברית"
              onClick={setLocale}
            >
              <Languages size={18} />
            </button>
            {write && (
              <button
                className="primary"
                onClick={() => {
                  setAt(localDateTime());
                  setLogOpen(true);
                }}
              >
                <Plus size={18} />
                {t.log}
              </button>
            )}
          </div>
        </header>
        <section className="summary-strip">
          <div>
            <p>Last feeding</p>
            <strong>
              {lastFeed ? clock(lastFeed.event_time, user.locale) : "—"}
            </strong>
          </div>
          <div>
            <p>Next expected</p>
            <strong>
              {expected ? clock(expected.toISOString(), user.locale) : "—"}
            </strong>
            <span className="soft-warning">from its reminder</span>
          </div>
          <div>
            <p>Care today</p>
            <strong>{events.length} events</strong>
            <span>live from PostgreSQL</span>
          </div>
        </section>
        <section className="timeline-area">
          <div className="section-head">
            <h2>Care history</h2>
            <button
              className="text-button"
              onClick={() => {
                setPanel("notes");
                loadNotes();
              }}
            >
              {t.notes}
            </button>
          </div>
          <div className="timeline-list">
            {events.map((event) => (
              <article className="event" key={event.id}>
                <time>{clock(event.event_time, user.locale)}</time>
                <span className="event-line">
                  <i style={{ background: event.color }}>{icon(event.kind)}</i>
                </span>
                <div className="event-content">
                  <div className="event-title">
                    <h3>{event.activity_name}</h3>
                    <span>by {event.created_by}</span>
                  </div>
                  <p>{eventDetail(event)}</p>
                  {event.note && <small>“{event.note}”</small>}
                </div>
                <button className="more" onClick={() => openComments(event)}>
                  <MessageCircle size={17} />
                </button>
              </article>
            ))}
          </div>
        </section>
      </section>
      <aside className="upcoming">
        <div className="upcoming-head">
          <h2>{t.upcoming}</h2>
          <button className="more" onClick={() => setPanel("reminder")}>
            <Plus size={18} />
          </button>
        </div>
        {dash.reminders.map((reminder) => (
          <div className="due-item" key={reminder.id}>
            <span className="due-icon">
              {reminder.kind === "one_time" ? (
                <HeartPulse size={17} />
              ) : (
                <Utensils size={17} />
              )}
            </span>
            <div>
              <h3>{reminder.title}</h3>
              <p>
                {reminder.kind === "one_time" && reminder.scheduled_for
                  ? clock(reminder.scheduled_for, user.locale)
                  : `every ${Math.round((reminder.interval_minutes ?? 0) / 60)}h`}
              </p>
            </div>
            <button
              className="check"
              onClick={() => completeReminder(reminder)}
            >
              <Check size={13} />
            </button>
            {owner && (
              <button className="more" onClick={() => deleteReminder(reminder)}>
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        <button
          className="care-gap action-tile"
          onClick={() => setPanel("gap")}
        >
          <span>✦</span>
          <div>
            <h3>Declare care gap</h3>
            <p>Exclude a deliberate tracking break.</p>
          </div>
        </button>
        {owner && (
          <button className="invite-tile" onClick={() => setPanel("invite")}>
            <Users size={16} />
            Invite caregiver
          </button>
        )}
      </aside>
      {logOpen && (
        <LogModal
          activity={current}
          activities={dash.activities}
          at={at}
          values={values}
          note={note}
          onClose={() => setLogOpen(false)}
          onActivity={setActivityId}
          onAt={setAt}
          onValues={setValues}
          onNote={setNote}
          onSubmit={addLog}
        />
      )}
      {panel && (
        <ManageModal
          panel={panel}
          activities={dash.activities}
          children={children}
          notes={notes}
          inviteUrl={inviteUrl}
          owner={owner}
          onClose={() => setPanel(null)}
          onActivity={createActivity}
          onArchive={archiveActivity}
          onField={addField}
          onReminder={remind}
          onGap={gap}
          onInvite={invite}
          onNote={addNote}
          onChild={createChild}
          onRenameChild={renameChild}
        />
      )}
    </main>
  );
}

function LogModal({
  activity,
  activities,
  at,
  values,
  note,
  onClose,
  onActivity,
  onAt,
  onValues,
  onNote,
  onSubmit,
}: {
  activity?: Activity;
  activities: Activity[];
  at: string;
  values: Record<string, unknown>;
  note: string;
  onClose: () => void;
  onActivity: (id: string) => void;
  onAt: (value: string) => void;
  onValues: (value: Record<string, unknown>) => void;
  onNote: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <div className="modal-backdrop">
      <form className="log-modal" onSubmit={onSubmit}>
        <button type="button" className="close" onClick={onClose}>
          <X size={20} />
        </button>
        <p className="eyebrow">QUICK LOG</p>
        <h2>What happened?</h2>
        <div className="activity-picker">
          {activities.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === activity?.id ? "selected" : ""}
              onClick={() => onActivity(item.id)}
            >
              <i style={{ background: item.color }}>{icon(item.kind)}</i>
              {item.name}
            </button>
          ))}
        </div>
        <label>
          When
          <input
            type="datetime-local"
            value={at}
            onChange={(event) => onAt(event.target.value)}
            required
          />
        </label>
        {activity?.fields.map((field) => (
          <label key={field.id}>
            {field.label}
            {field.field_type === "boolean" ? (
              <input
                type="checkbox"
                checked={Boolean(values[field.field_key])}
                onChange={(event) =>
                  onValues({
                    ...values,
                    [field.field_key]: event.target.checked,
                  })
                }
              />
            ) : field.field_type === "select" && field.options.length ? (
              <select
                value={String(values[field.field_key] ?? "")}
                onChange={(event) =>
                  onValues({ ...values, [field.field_key]: event.target.value })
                }
              >
                {field.options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                type={
                  field.field_type === "number" ||
                  field.field_type === "duration"
                    ? "number"
                    : "text"
                }
                value={String(values[field.field_key] ?? "")}
                onChange={(event) =>
                  onValues({ ...values, [field.field_key]: event.target.value })
                }
              />
            )}
          </label>
        ))}
        <label>
          Note
          <textarea
            value={note}
            onChange={(event) => onNote(event.target.value)}
            placeholder="Optional context for everyone"
          />
        </label>
        <button className="primary submit">Save</button>
      </form>
    </div>
  );
}

function Home({
  user,
  error,
  createChildOpen,
  onCreate,
  onCloseCreate,
  onCreateChild,
  onSignOut,
}: {
  user: User;
  error: string;
  createChildOpen: boolean;
  onCreate: () => void;
  onCloseCreate: () => void;
  onCreateChild: (event: FormEvent<HTMLFormElement>) => void;
  onSignOut: () => void;
}) {
  return (
    <main className="home-shell">
      <header className="home-header">
        <div className="brand">
          <span className="brand-mark">n</span>
          <span>Nurture</span>
        </div>
        <div className="home-account">
          <span className="avatar you">{user.display_name[0]}</span>
          <span>
            <strong>{user.display_name}</strong>
            <small>{user.email}</small>
          </span>
          <button className="icon-button" title="Sign out" onClick={onSignOut}>
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <section className="empty-home">
        <p className="eyebrow">YOUR FAMILY SPACE</p>
        <h1>
          Everything starts when
          <br />
          you’re ready.
        </h1>
        <p>
          There are no child profiles in your family space yet. Create one
          whenever you want to begin tracking care.
        </p>
        <button className="primary home-create" onClick={onCreate}>
          <Plus size={18} />
          Create child
        </button>
      </section>
      {createChildOpen && (
        <div className="modal-backdrop">
          <form
            className="log-modal create-child-modal"
            onSubmit={onCreateChild}
          >
            <button type="button" className="close" onClick={onCloseCreate}>
              <X size={20} />
            </button>
            <p className="eyebrow">NEW CHILD PROFILE</p>
            <h2>Add a child</h2>
            <p className="time-hint">
              You can add more children and invite caregivers later.
            </p>
            <label>
              Child’s name
              <input name="name" autoFocus required />
            </label>
            <label>
              Timezone
              <input
                name="timezone"
                defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
                required
              />
            </label>
            <label>
              Birth date <small>(optional)</small>
              <input name="birthDate" type="date" />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary submit">Create child</button>
          </form>
        </div>
      )}
    </main>
  );
}

function ChildrenHome({
  user,
  children,
  error,
  createChildOpen,
  onCreate,
  onCloseCreate,
  onCreateChild,
  onSelectChild,
  onEditChild,
  onDeleteChild,
  onClose,
  onSignOut,
}: {
  user: User;
  children: Child[];
  error: string;
  createChildOpen: boolean;
  onCreate: () => void;
  onCloseCreate: () => void;
  onCreateChild: (event: FormEvent<HTMLFormElement>) => void;
  onSelectChild: (child: Child) => void;
  onEditChild: (child: Child) => void;
  onDeleteChild: (child: Child) => void;
  onClose: () => void;
  onSignOut: () => void;
}) {
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  return (
    <main className="home-shell">
      <header className="home-header">
        <div className="brand">
          <span className="brand-mark">n</span>
          <span>Nurture</span>
        </div>
        <div className="home-account">
          <span className="avatar you">{user.display_name[0]}</span>
          <span>
            <strong>{user.display_name}</strong>
            <small>{user.email}</small>
          </span>
          <button className="icon-button" title="Sign out" onClick={onSignOut}>
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <section className="children-home">
        <div className="children-home-heading">
          <div>
            <p className="eyebrow">YOUR FAMILY SPACE</p>
            <h1>Children & people</h1>
            <p>Select a child to open their care timeline.</p>
          </div>
          <button className="primary" onClick={onCreate}>
            <Plus size={18} />
            Add child
          </button>
        </div>
        <div className="children-list">
          {children.map((item) => (
            <article className="child-row" key={item.id}>
              <button
                className="child-row-main"
                onClick={() => onSelectChild(item)}
              >
                <span className="avatar">{item.name[0]}</span>
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.timezone} · {item.role}
                  </small>
                </span>
                <span className="child-row-arrow">→</span>
              </button>
              {item.role === "owner" && (
                <div className="child-actions">
                  <button
                    className="more child-more"
                    title={`Actions for ${item.name}`}
                    onClick={() =>
                      setActionsFor(actionsFor === item.id ? null : item.id)
                    }
                  >
                    <MoreHorizontal size={20} />
                  </button>
                  {actionsFor === item.id && (
                    <div className="child-actions-menu">
                      <button
                        onClick={() => {
                          setActionsFor(null);
                          onEditChild(item);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          setActionsFor(null);
                          onDeleteChild(item);
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
        <button className="text-button children-back" onClick={onClose}>
          Back to timeline
        </button>
      </section>
      {createChildOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onCloseCreate();
          }}
        >
          <form
            className="log-modal create-child-modal"
            onSubmit={onCreateChild}
          >
            <button type="button" className="close" onClick={onCloseCreate}>
              <X size={20} />
            </button>
            <p className="eyebrow">NEW CHILD PROFILE</p>
            <h2>Add a child</h2>
            <p className="time-hint">
              You can add more children and invite caregivers later.
            </p>
            <label>
              Child’s name
              <input name="name" autoFocus required />
            </label>
            <label>
              Timezone
              <input
                name="timezone"
                defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
                required
              />
            </label>
            <label>
              Birth date <small>(optional)</small>
              <input name="birthDate" type="date" />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary submit">Create child</button>
          </form>
        </div>
      )}
    </main>
  );
}

function ManageModal({
  panel,
  activities,
  children,
  notes,
  inviteUrl,
  owner,
  onClose,
  onActivity,
  onArchive,
  onField,
  onReminder,
  onGap,
  onInvite,
  onNote,
  onChild,
  onRenameChild,
}: {
  panel: Panel;
  activities: Activity[];
  children: Child[];
  notes: Note[];
  inviteUrl: string;
  owner: boolean;
  onClose: () => void;
  onActivity: (event: FormEvent<HTMLFormElement>) => void;
  onArchive: (id: string) => void;
  onField: (event: FormEvent<HTMLFormElement>) => void;
  onReminder: (event: FormEvent<HTMLFormElement>) => void;
  onGap: (event: FormEvent<HTMLFormElement>) => void;
  onInvite: (event: FormEvent<HTMLFormElement>) => void;
  onNote: (event: FormEvent<HTMLFormElement>) => void;
  onChild: (event: FormEvent<HTMLFormElement>) => void;
  onRenameChild: (child: Child) => void;
}) {
  const fields = (
    <>
      <label>
        Field type
        <select name="type">
          <option value="number">Number</option>
          <option value="text">Text</option>
          <option value="boolean">Yes / no</option>
          <option value="select">Single select</option>
          <option value="duration">Duration</option>
        </select>
      </label>
      <label>
        Unit
        <input name="unit" placeholder="e.g. ml, °C" />
      </label>
      <label>
        Options for a select
        <input name="options" placeholder="e.g. left, right" />
      </label>
    </>
  );
  return (
    <div className="modal-backdrop">
      <section className="log-modal manager">
        <button className="close" onClick={onClose}>
          <X size={20} />
        </button>
        {panel === "activity" && (
          <>
            <form onSubmit={onActivity}>
              <h2>Custom activity</h2>
              <label>
                Name
                <input name="name" required placeholder="e.g. Bath" />
              </label>
              <label>
                First field (optional)
                <input name="field" placeholder="e.g. Temperature" />
              </label>
              {fields}
              <button className="primary submit">Create activity</button>
            </form>
            <form onSubmit={onField}>
              <h3>Add a field</h3>
              <label>
                Activity
                <select name="activityId">
                  {activities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {activity.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Field name
                <input name="field" required />
              </label>
              {fields}
              <button className="text-button">Add field</button>
            </form>
            {owner && (
              <div className="note-list">
                {activities.map((activity) => (
                  <article key={activity.id}>
                    <strong>{activity.name}</strong>
                    <button
                      className="text-button danger"
                      onClick={() => onArchive(activity.id)}
                    >
                      Remove activity
                    </button>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
        {panel === "reminder" && (
          <form onSubmit={onReminder}>
            <h2>Passive reminder</h2>
            <label>
              Title
              <input name="title" required />
            </label>
            <label>
              Activity
              <select name="activityId">
                <option value="">None</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Schedule
              <select name="kind">
                <option value="interval">Repeat after last activity</option>
                <option value="one_time">One time</option>
              </select>
            </label>
            <label>
              Interval hours
              <input name="hours" type="number" min="1" defaultValue="3" />
            </label>
            <label>
              One-time date/time
              <input name="when" type="datetime-local" />
            </label>
            <button className="primary submit">Save reminder</button>
          </form>
        )}
        {panel === "gap" && (
          <form onSubmit={onGap}>
            <h2>Declare care gap</h2>
            <p className="time-hint">
              Logs in or across this range do not affect interval analytics.
            </p>
            <label>
              Start
              <input name="start" type="datetime-local" required />
            </label>
            <label>
              End
              <input name="end" type="datetime-local" required />
            </label>
            <label>
              Reason
              <input name="reason" placeholder="Shabbat" />
            </label>
            <button className="primary submit">Declare gap</button>
          </form>
        )}
        {panel === "invite" && (
          <form onSubmit={onInvite}>
            <h2>Invite caregiver</h2>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Role
              <select name="role">
                <option value="caregiver">Caregiver</option>
                <option value="viewer">Viewer</option>
              </select>
            </label>
            <button className="primary submit">Create invitation</button>
            {inviteUrl && <textarea readOnly value={inviteUrl} />}
          </form>
        )}
        {panel === "notes" && (
          <>
            <form onSubmit={onNote}>
              <h2>Notes</h2>
              <label>
                New note
                <textarea name="body" required />
              </label>
              <label>
                Visibility
                <select name="visibility">
                  <option value="shared">Shared</option>
                  <option value="private">Private</option>
                </select>
              </label>
              <button className="primary submit">Save note</button>
            </form>
            <div className="note-list">
              {notes.map((note) => (
                <article key={note.id}>
                  <strong>
                    {note.created_by_name} · {note.visibility}
                  </strong>
                  <p>{note.body}</p>
                </article>
              ))}
            </div>
          </>
        )}
        {panel === "children" && (
          <>
            <h2>Children & people</h2>
            <div className="note-list">
              {children.map((child) => (
                <article key={child.id}>
                  <strong>{child.name}</strong>
                  <p>Your role: {child.role}</p>
                  {child.role === "owner" && (
                    <button
                      className="text-button"
                      onClick={() => onRenameChild(child)}
                    >
                      Rename
                    </button>
                  )}
                </article>
              ))}
            </div>
            <form onSubmit={onChild}>
              <h3>Add another child</h3>
              <label>
                Name
                <input name="name" required />
              </label>
              <label>
                Timezone
                <input
                  name="timezone"
                  defaultValue={
                    Intl.DateTimeFormat().resolvedOptions().timeZone
                  }
                  required
                />
              </label>
              <label>
                Birth date
                <input name="birthDate" type="date" />
              </label>
              <button className="text-button">Create child</button>
            </form>
            {owner && (
              <p className="time-hint">
                Use Invite caregiver from the right panel to add people.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function CommentsModal({
  item,
  comments,
  comment,
  write,
  canDelete,
  onClose,
  onChange,
  onSubmit,
  onDelete,
}: {
  item: Event;
  comments: Comment[];
  comment: string;
  write: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onDelete: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section className="log-modal manager">
        <button className="close" onClick={onClose}>
          <X size={20} />
        </button>
        <h2>Comments</h2>
        <p className="time-hint">{item.activity_name}</p>
        <div className="note-list">
          {comments.map((entry) => (
            <article key={entry.id}>
              <strong>{entry.created_by_name}</strong>
              <p>{entry.body}</p>
            </article>
          ))}
        </div>
        {write && (
          <form onSubmit={onSubmit}>
            <label>
              Comment
              <textarea
                value={comment}
                onChange={(event) => onChange(event.target.value)}
                required
              />
            </label>
            <button className="primary submit">Save</button>
          </form>
        )}
        {canDelete && (
          <button className="text-button danger" onClick={onDelete}>
            <Trash2 size={14} />
            Delete this care record
          </button>
        )}
      </section>
    </div>
  );
}

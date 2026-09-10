import { FormEvent, Fragment, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import { AnalyticsView } from "./AnalyticsView";
import { CaregiversPage } from "./CaregiversPage";
import { NotesPage } from "./NotesPage";
import { CommentsPage } from "./CommentsPage";
import { CreateChildModal } from "./components/CreateChildModal";
import { LanguageControl } from "./components/LanguageControl";
import { LanguagePicker } from "./components/LanguagePicker";
import { ModalBackdrop } from "./components/ModalBackdrop";
import { NurtureBrand } from "./components/NurtureBrand";
import { ReminderScheduleFields } from "./components/ReminderScheduleFields";
import { SidebarAccount } from "./components/SidebarAccount";
import { TimezoneSelect } from "./components/TimezoneSelect";
import { timeZoneLabel } from "./timezones";
import { translate } from "./i18n";
import {
  Check,
  ChevronDown,
  ClipboardPlus,
  Clock3,
  Copy,
  Droplets,
  FileDown,
  HeartPulse,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Settings2,
  Sparkles,
  Trash2,
  Utensils,
  UserMinus,
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
  feeding_portions: FeedingPortion[];
  comment_count?: number;
  first_comment?: string | null;
  first_comment_author?: string | null;
};
type FeedingPortion = {
  kind: "breast_milk" | "formula";
  delivery_method: "bottle" | "breastfeeding";
  amount_ml: number;
};
type FeedingPortionDraft = {
  kind: FeedingPortion["kind"];
  deliveryMethod: FeedingPortion["delivery_method"];
  amountMl: string;
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
  average: ActivityMetrics;
  calendar_day: ActivityMetrics;
  last_24_hours: ActivityMetrics;
  history: Array<ActivityMetrics & { date: string }>;
};
type ActivityMetrics = {
  count: number;
  portion_count: number;
  total_amount_ml: number;
  average_amount_ml: number | null;
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
type ChildMember = {
  id: string;
  display_name: string;
  email: string;
  role: "owner" | "caregiver" | "viewer";
};
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
type InvitationPreview = {
  child_name: string;
  invited_by_name: string;
  created_at: string;
  role: "caregiver" | "viewer";
};
type LeavePreview = {
  action: "leave" | "transfer" | "delete";
  child_name: string;
  successor_name?: string;
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

const localDateTime = (value: string | Date = new Date()) => {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};
const clock = (value: string, locale = "en") =>
  new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
function usePageScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [locked]);
}
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
function humanizeFieldKey(fieldKey: string) {
  return fieldKey === "clothesChanged"
    ? "Clothes changed"
    : fieldKey.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}
function eventDetail(
  event: Event,
  activities: Activity[],
  t: (text: string) => string,
) {
  if (event.kind === "feeding" && event.feeding_portions.length)
    return event.feeding_portions
      .map(
        (portion) =>
          `${t(portion.kind === "breast_milk" ? "Breast milk" : "Formula")} · ${t(portion.delivery_method === "bottle" ? "Bottle" : "Breastfeeding")}: ${portion.amount_ml} ${t("ml")}`,
      )
      .join(" · ");
  const activity = activities.find((item) => item.id === event.activity_id);
  const values = Object.entries(event.field_values)
    .filter(([, value]) => value !== "" && value !== false && value != null)
    .map(([key, value]) => {
      const field = activity?.fields.find((item) => item.field_key === key);
      const label = t(field?.label ?? humanizeFieldKey(key));
      const displayValue =
        typeof value === "boolean"
          ? t(value ? "Yes" : "No")
          : t(String(value));
      return `${label}: ${displayValue}`;
    });
  return values.join(" · ") || t("Care activity");
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [members, setMembers] = useState<ChildMember[]>([]);
  const [child, setChild] = useState<Child | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [auth, setAuth] = useState<"sign-in" | "register">("sign-in");
  const [email, setEmail] = useState("alex@nurture.local");
  const [password, setPassword] = useState("nurture-demo");
  const [name, setName] = useState("");
  const [routePath, setRoutePath] = useState(() => location.pathname || "/");
  const [panel, setPanel] = useState<Panel>(null);
  const [homeOpen, setHomeOpen] = useState(false);
  const [createChildOpen, setCreateChildOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<Event | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [activityId, setActivityId] = useState("");
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [feedingPortions, setFeedingPortions] = useState<FeedingPortionDraft[]>(
    [{ kind: "breast_milk", deliveryMethod: "bottle", amountMl: "" }],
  );
  const [note, setNote] = useState("");
  const [at, setAt] = useState(localDateTime());
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Event | null>(null);
  const [detailEvent, setDetailEvent] = useState<Event | null>(null);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [comment, setComment] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [invitePreview, setInvitePreview] = useState<InvitationPreview | null>(
    null,
  );
  const [leavePreview, setLeavePreview] = useState<LeavePreview | null>(null);
  usePageScrollLock(mobileSidebarOpen);
  const locale: User["locale"] =
    user?.locale ?? (navigator.language.startsWith("he") ? "he" : "en");
  const t = (text: string) => translate(locale, text);
  const insightsOpen = /^\/children\/[^/]+\/insights$/.test(routePath);
  const caregiversOpen = /^\/children\/[^/]+\/caregivers$/.test(routePath);
  const owner = dash?.role === "owner";
  const write = dash?.role !== "viewer";
  const events = dash?.timeline ?? [];
  const childTimeZone = child?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dayKeyFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: childTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    [childTimeZone],
  );
  const timelineDayFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(user?.locale === "he" ? "he-IL" : "en-US", {
        timeZone: childTimeZone,
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [childTimeZone, user?.locale],
  );
  const localDayKey = (value: string | Date) =>
    dayKeyFormatter
      .formatToParts(new Date(value))
      .filter((part) => part.type !== "literal")
      .map((part) => part.value)
      .join("-");
  const todayDayKey = localDayKey(new Date());
  const summaryTime = (value: string | Date) => {
    const isToday = localDayKey(value) === todayDayKey;
    return new Intl.DateTimeFormat(user?.locale === "he" ? "he-IL" : "en-US", {
      timeZone: childTimeZone,
      ...(isToday
        ? { hour: "numeric", minute: "2-digit" }
        : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
    }).format(new Date(value));
  };
  const todayEvents = events.filter(
    (event) => localDayKey(event.event_time) === todayDayKey,
  );
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
  const loadMembers = async (id: string) => {
    setMembers(await api<ChildMember[]>(`/api/children/${id}/members`));
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
    const match = routePath.match(/^\/children\/([^/]+)(?:\/(?:insights|caregivers))?$/);
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
    const match = routePath.match(/^\/children\/([^/]+)\/caregivers$/);
    if (match) loadMembers(match[1]).catch((cause: Error) => setError(cause.message));
  }, [routePath]);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "he" ? "rtl" : "ltr";
    if (!user) return;
    const token = new URLSearchParams(location.search).get("invite");
    if (token)
      api<InvitationPreview>(`/api/invitations/${token}`)
        .then((preview) => {
          setInviteToken(token);
          setInvitePreview(preview);
        })
        .catch((cause: Error) => setError(cause.message));
  }, [user?.id, locale]);
  const clearInvite = () => {
    const url = new URL(location.href);
    url.searchParams.delete("invite");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    setInviteToken(null);
    setInvitePreview(null);
  };
  const acceptInvite = async () => {
    if (!inviteToken) return;
    await api(`/api/invitations/${inviteToken}/accept`, { method: "POST" });
    clearInvite();
    await load();
  };
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
        setLanguageOpen(false);
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
            locale,
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
    const name = prompt(t("Child's name"), item.name);
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
        locale === "he"
          ? `למחוק את הפרופיל של ${item.name}? היסטוריית הטיפול הקיימת תישמר בארכיון.`
          : `Delete ${item.name}'s profile? Its existing care history will be archived.`,
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
  async function openLeave() {
    if (!child) return;
    try {
      setLeavePreview(
        await api<LeavePreview>(`/api/children/${child.id}/leave-preview`),
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function leaveChild() {
    if (!child) return;
    try {
      await api(`/api/children/${child.id}/leave`, { method: "POST" });
      setLeavePreview(null);
      setChild(null);
      setDash(null);
      navigate("/children", true);
      await load();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  async function saveLog(event: FormEvent) {
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
    const portions = feedingPortions.map((portion) => ({
      kind: portion.kind,
      deliveryMethod: portion.deliveryMethod,
      amountMl: Number(portion.amountMl),
    }));
    await api(editingLog ? `/api/logs/${editingLog.id}` : `/api/children/${child.id}/logs`, {
      method: editingLog ? "PUT" : "POST",
      body: JSON.stringify({
        activityId,
        eventTime: new Date(at).toISOString(),
        eventTimezone: child.timezone,
        fieldValues,
        portions: current.kind === "feeding" ? portions : undefined,
        note,
      }),
    });
    setNote("");
    setFeedingPortions([
      { kind: "breast_milk", deliveryMethod: "bottle", amountMl: "" },
    ]);
    setEditingLog(null);
    setLogOpen(false);
    await loadDash(child.id);
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
        t(
          "Remove this activity from future logging? Existing history stays in exports.",
        ),
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
      throw new Error(t("Choose a date and time."));
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
  async function updateReminder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!child || !selectedReminder) return;
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind")) as Reminder["kind"];
    const when = String(form.get("when"));
    if (kind === "one_time" && !when)
      throw new Error(t("Choose a date and time."));
    await api(`/api/reminders/${selectedReminder.id}`, {
      method: "PUT",
      body: JSON.stringify({
        title: form.get("title"),
        activityId: form.get("activityId") || null,
        kind,
        intervalMinutes:
          kind === "interval" ? Number(form.get("hours")) * 60 : null,
        scheduledFor:
          kind === "one_time" ? new Date(when).toISOString() : null,
      }),
    });
    setSelectedReminder(null);
    await loadDash(child.id);
  }
  async function completeReminder(item: Reminder) {
    if (!child) return;
    await api(`/api/reminders/${item.id}/complete`, { method: "POST" });
    await loadDash(child.id);
  }
  async function deleteReminder(item: Reminder) {
    if (!child || !confirm(t("Delete this reminder?"))) return;
    await api(`/api/reminders/${item.id}`, { method: "DELETE" });
    setSelectedReminder((current) => (current?.id === item.id ? null : current));
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
    const body = prompt(t("Edit note"), item.body);
    if (body === null) return;
    await api(`/api/notes/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ body, visibility: item.visibility }),
    });
    await loadNotes();
  }
  async function deleteNote(item: Note) {
    if (!confirm(t("Delete this note?"))) return;
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
    const body = prompt(t("Edit comment"), item.body);
    if (body === null) return;
    await api(`/api/comments/${item.id}`, {
      method: "PUT",
      body: JSON.stringify({ body }),
    });
    setComments(await api<Comment[]>(`/api/logs/${selected.id}/comments`));
  }
  async function deleteComment(item: Comment) {
    if (!selected || !confirm(t("Delete this comment?"))) return;
    await api(`/api/comments/${item.id}`, { method: "DELETE" });
    setComments(await api<Comment[]>(`/api/logs/${selected.id}/comments`));
  }
  async function deleteLog() {
    if (
      !selected ||
      !child ||
      !confirm(t("Permanently delete this care record?"))
    )
      return;
    await api(`/api/logs/${selected.id}`, { method: "DELETE" });
    setSelected(null);
    await loadDash(child.id);
  }
  async function changeMemberRole(
    member: ChildMember,
    role: "caregiver" | "viewer",
  ) {
    if (!child) return;
    await api(`/api/children/${child.id}/members/${member.id}`, {
      method: "PUT",
      body: JSON.stringify({ role }),
    });
    await loadMembers(child.id);
  }
  async function removeMember(member: ChildMember) {
    if (!child || !confirm(t("Remove this person's access?"))) return;
    await api(`/api/children/${child.id}/members/${member.id}`, {
      method: "DELETE",
    });
    await loadMembers(child.id);
  }
  function editLog() {
    if (!selected || !child) return;
    setActivityId(selected.activity_id);
    setAt(localDateTime(selected.event_time));
    setValues(selected.field_values);
    setFeedingPortions(
      selected.feeding_portions.map((portion) => ({
        kind: portion.kind,
        deliveryMethod: portion.delivery_method,
        amountMl: String(portion.amount_ml),
      })),
    );
    setNote(selected.note ?? "");
    setSelected(null);
    setEditingLog(selected);
    setLogOpen(true);
  }
  const setLocale = async (locale: User["locale"]) => {
    if (!user) return;
    await api("/api/me/locale", {
      method: "PUT",
      body: JSON.stringify({ locale }),
    });
    setUser({ ...user, locale });
    setLanguageOpen(false);
  };
  const openCreateChild = () => {
    setError("");
    setCreateChildOpen(true);
  };
  const signOut = async () => {
    await api("/api/auth/sign-out", { method: "POST" });
    setUser(null);
    setChildren([]);
    setChild(null);
    setHomeOpen(false);
    navigate("/", true);
  };
  if (loading)
    return <div className="loading-screen">{t("Loading Nurture…")}</div>;
  if (!user)
    return (
      <div className="sign-in-shell">
        <form className="sign-in" onSubmit={login}>
          <NurtureBrand />
          <p className="eyebrow">{t("SHARED CHILD CARE")}</p>
          <h1>
            {auth === "sign-in"
              ? t("Welcome back.")
              : t("Start your family space.")}
          </h1>
          {auth === "register" && (
            <label>
              {t("Name")}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </label>
          )}
          <label>
            {t("Email")}
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
            />
          </label>
          <label>
            {t("Password")}
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
            {auth === "sign-in" ? t("Sign in") : t("Create account")}
          </button>
          <button
            className="text-button auth-switch"
            type="button"
            onClick={() => setAuth(auth === "sign-in" ? "register" : "sign-in")}
          >
            {auth === "sign-in"
              ? t("Need an account? Register")
              : t("Already have an account? Sign in")}
          </button>
          <a className="google-link" href="/api/auth/google">
            {t("Continue with Google")}
          </a>
          <small>{t("Local sample:")} alex@nurture.local / nurture-demo</small>
        </form>
      </div>
    );
  if (routePath === "/children")
    return (
      <>
        <ChildrenHome
          user={user}
          children={children}
          error={error}
          createChildOpen={createChildOpen}
          onCreate={openCreateChild}
          onCloseCreate={() => setCreateChildOpen(false)}
          onCreateChild={createChild}
          onSelectChild={(item) => {
            setChild(item);
            navigate(`/children/${item.id}`);
          }}
          onEditChild={renameChild}
          onDeleteChild={deleteChild}
          languageOpen={languageOpen}
          onOpenLanguage={() => setLanguageOpen(true)}
          onCloseLanguage={() => setLanguageOpen(false)}
          onLocale={setLocale}
          onSignOut={signOut}
          onHome={() => navigate("/children")}
        />
        {invitePreview && (
          <InvitationPreviewModal
            locale={user.locale}
            invitation={invitePreview}
            onAccept={acceptInvite}
            onClose={clearInvite}
          />
        )}
      </>
    );
  if (!child || homeOpen)
    return (
      <Home
        user={user}
        error={error}
        createChildOpen={createChildOpen}
        onCreate={openCreateChild}
        onCloseCreate={() => setCreateChildOpen(false)}
        onCreateChild={createChild}
        languageOpen={languageOpen}
        onOpenLanguage={() => setLanguageOpen(true)}
        onCloseLanguage={() => setLanguageOpen(false)}
        onLocale={setLocale}
        onSignOut={signOut}
        onHome={() => navigate("/children")}
      />
    );
  if (!dash)
    return <div className="loading-screen">{t("Loading family space…")}</div>;
  if (panel === "notes")
    return (
      <NotesPage
        locale={user.locale}
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
        locale={user.locale}
        item={selected!}
        comments={comments}
        comment={comment}
        userId={user.id}
        write={write}
        canEditLog={owner || selected!.created_by_id === user.id}
        canDeleteLog={owner || selected!.created_by_id === user.id}
        onClose={() => setSelected(null)}
        onChange={setComment}
        onCreate={addComment}
        onEdit={editComment}
        onDeleteComment={deleteComment}
        onEditLog={editLog}
        onDeleteLog={deleteLog}
      />
    );
  return (
    <main
      className={`app-shell ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`}
    >
      <button
        className="sidebar-scrim"
        aria-label={t("Close navigation")}
        onClick={() => setMobileSidebarOpen(false)}
      />
      <aside className="sidebar">
        <NurtureBrand onClick={() => navigate("/children")} />
        <label className="child-switch">
          <span className="avatar">{child.name[0]}</span>
          <span>
            <strong>{child.name}</strong>
            <small>{timeZoneLabel(child.timezone, user.locale)}</small>
          </span>
          <select
            value={child.id}
            onChange={(event) => navigate(`/children/${event.target.value}`)}
          >
            {children.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <nav onClickCapture={() => setMobileSidebarOpen(false)}>
          <button
            className={insightsOpen ? "" : "nav-active"}
            onClick={() => navigate(`/children/${child.id}`)}
          >
            <Clock3 size={18} />
            {t("Timeline")}
          </button>
          <button
            className={insightsOpen ? "nav-active" : ""}
            onClick={() => navigate(`/children/${child.id}/insights`)}
          >
            <Sparkles size={18} />
            {t("Insights")}
          </button>
        </nav>
        <div
          className="sidebar-bottom"
          onClickCapture={() => setMobileSidebarOpen(false)}
        >
          <button onClick={() => setPanel("activity")}>
            <Settings2 size={18} />
            {t("Manage care")}
          </button>
          <button onClick={() => setPanel("gap")}>
            <HeartPulse size={18} />
            {t("Declare care gap")}
          </button>
          {owner && (
            <button onClick={() => setPanel("invite")}>
              <Users size={18} />
              {t("Invite caregiver")}
            </button>
          )}
          <button
            className={caregiversOpen ? "nav-active" : ""}
            onClick={() => navigate(`/children/${child.id}/caregivers`)}
          >
            <Users size={18} />
            {t("Caregivers")}
          </button>
          <button onClick={() => navigate("/children")}>
            <Users size={18} />
            {t("Children")}
          </button>
          <LanguageControl
            locale={user.locale}
            label={t("Language")}
            onClick={() => setLanguageOpen(true)}
          />
          <button className="leave-space" onClick={openLeave}>
            <UserMinus size={18} />
            {t("Leave care space")}
          </button>
          <SidebarAccount
            displayName={user.display_name}
            detail={t(dash.role)}
            signOutLabel={t("Sign out")}
            onSignOut={signOut}
          />
        </div>
      </aside>
      <section className={`workspace ${insightsOpen || caregiversOpen ? "insights-workspace" : ""}`}>
        {insightsOpen ? (
          <AnalyticsView
            child={child}
            dashboard={dash}
            locale={user.locale}
            onBack={() => navigate(`/children/${child.id}`)}
            onOpenNavigation={() => setMobileSidebarOpen(true)}
          />
        ) : caregiversOpen ? (
          <CaregiversPage
            locale={user.locale}
            members={members}
            owner={owner}
            onBack={() => navigate(`/children/${child.id}`)}
            onOpenNavigation={() => setMobileSidebarOpen(true)}
            onChangeRole={changeMemberRole}
            onRemove={removeMember}
          />
        ) : (
          <>
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="mobile-menu"
              aria-label={t("Open navigation")}
              aria-expanded={mobileSidebarOpen}
              onClick={() => setMobileSidebarOpen(true)}
            >
              <Menu size={21} />
            </button>
            <h1>
              {locale === "he"
                ? `ציר הזמן של ${child.name}`
                : `${child.name}’s timeline`}
            </h1>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              title={t("Export CSV")}
              onClick={() =>
                window.open(`/api/children/${child.id}/export.csv`, "_blank")
              }
            >
              <FileDown size={18} />
            </button>
            {write && (
              <button
                className="primary"
                onClick={() => {
                  setAt(localDateTime());
                  setFeedingPortions([
                    {
                      kind: "breast_milk",
                      deliveryMethod: "bottle",
                      amountMl: "",
                    },
                  ]);
                  setEditingLog(null);
                  setLogOpen(true);
                }}
              >
                <Plus size={18} />
                {t("Log care")}
              </button>
            )}
          </div>
        </header>
        <section className="summary-strip">
          <div>
            <p>{t("Last feeding")}</p>
            <strong>
              {lastFeed ? summaryTime(lastFeed.event_time) : "—"}
            </strong>
          </div>
          <div>
            <p>{t("Next expected")}</p>
            <strong>
              {expected ? summaryTime(expected) : "—"}
            </strong>
          </div>
          <div>
            <p>{t("Care today")}</p>
            <strong>
              {todayEvents.length} {t("events")}
            </strong>
          </div>
        </section>
        <UpcomingList
          reminders={dash.reminders}
          locale={user.locale}
          owner={owner}
          onLogActivity={write ? (id) => {
            setActivityId(id);
            setAt(localDateTime());
            setFeedingPortions([
              { kind: "breast_milk", deliveryMethod: "bottle", amountMl: "" },
            ]);
            setEditingLog(null);
            setLogOpen(true);
          } : undefined}
          onOpen={() => setPanel("reminder")}
          onSelect={setSelectedReminder}
          onComplete={completeReminder}
          onDelete={deleteReminder}
        />
        <section className="timeline-area">
          <div className="section-head">
            <h2>{t("Care history")}</h2>
            <button
              className="text-button"
              onClick={() => {
                setPanel("notes");
                loadNotes();
              }}
            >
              {t("Notes")}
            </button>
          </div>
          <div className="timeline-list">
            {events.map((event, index) => {
              const dayKey = localDayKey(event.event_time);
              const startsNewDay =
                index === 0 || localDayKey(events[index - 1].event_time) !== dayKey;
              const commentAuthor = event.first_comment_author?.trim().split(/\s+/)[0];
              return (
                <Fragment key={event.id}>
                  {startsNewDay && (
                    <div className="timeline-date-divider">
                      <span>{timelineDayFormatter.format(new Date(event.event_time))}</span>
                    </div>
                  )}
                  <article
                    className="event event-open-detail"
                    tabIndex={0}
                    role="button"
                    onClick={() => setDetailEvent(event)}
                    onKeyDown={(keyboardEvent) => {
                      if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                        keyboardEvent.preventDefault();
                        setDetailEvent(event);
                      }
                    }}
                  >
                    <time>{clock(event.event_time, user.locale)}</time>
                    <span className="event-line">
                      <i style={{ background: event.color }}>{icon(event.kind)}</i>
                    </span>
                    <div className="event-content">
                      <div className="event-title">
                        <h3>{t(event.activity_name)}</h3>
                        <span>
                          {t("by")} {event.created_by}
                        </span>
                      </div>
                      <p>{eventDetail(event, dash.activities, t)}</p>
                      {event.note && <small>“{event.note}”</small>}
                      {!!event.first_comment && (
                        <div className="event-comment-preview">
                          <MessageCircle size={13} aria-hidden="true" />
                          {commentAuthor && <strong>{commentAuthor}:</strong>}
                          <span className="event-comment-text">{event.first_comment}</span>
                          {(event.comment_count ?? 0) > 1 && (
                            <button
                              type="button"
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                openComments(event);
                              }}
                            >
                              {t("Show more")}
                              <ChevronDown size={13} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      className="more"
                      onClick={(clickEvent) => {
                        clickEvent.stopPropagation();
                        openComments(event);
                      }}
                    >
                      <MessageCircle size={17} />
                    </button>
                  </article>
                </Fragment>
              );
            })}
          </div>
        </section>
          </>
        )}
      </section>
      {languageOpen && (
        <LanguagePicker
          locale={user.locale}
          onClose={() => setLanguageOpen(false)}
          onSelect={setLocale}
        />
      )}
      {detailEvent && (
        <EventDetailModal
          event={detailEvent}
          activities={dash.activities}
          locale={user.locale}
          timeZone={child.timezone}
          onClose={() => setDetailEvent(null)}
        />
      )}
      {selectedReminder && (
        <ReminderDetailModal
          reminder={selectedReminder}
          activities={dash.activities}
          locale={user.locale}
          owner={owner}
          onClose={() => setSelectedReminder(null)}
          onSave={updateReminder}
          onDelete={() => deleteReminder(selectedReminder)}
        />
      )}
      {logOpen && (
        <LogModal
          locale={user.locale}
          activity={current}
          activities={dash.activities}
          at={at}
          values={values}
          portions={feedingPortions}
          note={note}
          onClose={() => {
            setEditingLog(null);
            setLogOpen(false);
          }}
          onActivity={setActivityId}
          onAt={setAt}
          onValues={setValues}
          onPortions={setFeedingPortions}
          onNote={setNote}
          editing={Boolean(editingLog)}
          onSubmit={saveLog}
        />
      )}
      {panel && (
        <ManageModal
          locale={user.locale}
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
      {leavePreview && (
        <LeaveCareSpaceModal
          locale={user.locale}
          preview={leavePreview}
          onClose={() => setLeavePreview(null)}
          onConfirm={leaveChild}
        />
      )}
    </main>
  );
}

function LeaveCareSpaceModal({
  locale,
  preview,
  onClose,
  onConfirm,
}: {
  locale: User["locale"];
  preview: LeavePreview;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = (text: string) => translate(locale, text);
  const message =
    preview.action === "transfer" ? (
      <>
        {preview.successor_name}{" "}
        {t("joined this care space first and will become the new owner.")}
      </>
    ) : preview.action === "delete" ? (
      t(
        "You are the only person in this care space. The child profile and care history will be permanently deleted.",
      )
    ) : (
      t("You will no longer have access to this child's care space.")
    );
  const confirmLabel =
    preview.action === "transfer"
      ? t("Transfer and leave")
      : preview.action === "delete"
        ? t("Delete child profile")
        : t("Leave care space");
  return (
    <ModalBackdrop onClose={onClose}>
      <section className="log-modal leave-modal">
        <button
          className="close"
          aria-label={t("Close leave confirmation")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <h2>{t("Are you sure you want to leave?")}</h2>
        <p className="leave-message">{message}</p>
        <div className="invitation-actions">
          <button className="text-button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            className={`primary ${preview.action === "delete" ? "danger-primary" : ""}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}

function InvitationPreviewModal({
  locale,
  invitation,
  onAccept,
  onClose,
}: {
  locale: User["locale"];
  invitation: InvitationPreview;
  onAccept: () => void;
  onClose: () => void;
}) {
  const t = (text: string) => translate(locale, text);
  const sentAt = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(invitation.created_at));
  return (
    <ModalBackdrop onClose={onClose}>
      <section className="log-modal invitation-preview">
        <button
          className="close"
          aria-label={t("Close invitation")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <p className="eyebrow">{t("CHILD CARE INVITATION")}</p>
        <h2>{t("Join a child's care space")}</h2>
        <p className="invitation-question">
          {t("Would you like to join the care space for")}{" "}
          {invitation.child_name}?
        </p>
        <dl className="invitation-details">
          <div>
            <dt>{t("Invited by")}</dt>
            <dd>{invitation.invited_by_name}</dd>
          </div>
          <div>
            <dt>{t("Sent")}</dt>
            <dd>{sentAt}</dd>
          </div>
          <div>
            <dt>{t("Your role")}</dt>
            <dd>{t(invitation.role)}</dd>
          </div>
        </dl>
        <div className="invitation-actions">
          <button className="text-button" onClick={onClose}>
            {t("Not now")}
          </button>
          <button className="primary" onClick={onAccept}>
            {t("Join care space")}
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}

function ReminderDetailModal({
  reminder,
  activities,
  locale,
  owner,
  onClose,
  onSave,
  onDelete,
}: {
  reminder: Reminder;
  activities: Activity[];
  locale: User["locale"];
  owner: boolean;
  onClose: () => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDelete: () => void;
}) {
  const t = (text: string) => translate(locale, text);
  const activity = activities.find((item) => item.id === reminder.activity_id);
  const schedule =
    reminder.kind === "one_time" && reminder.scheduled_for
      ? new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(reminder.scheduled_for))
      : `${t("Every")} ${Math.round((reminder.interval_minutes ?? 0) / 60)} ${t("hours after activity")}`;
  const heading = (
    <header className="reminder-detail-heading">
      <h2>{reminder.title}</h2>
      <button
        type="button"
        className="reminder-detail-close"
        onClick={onClose}
        aria-label={t("Close")}
      >
        <X size={22} />
      </button>
    </header>
  );

  return (
    <ModalBackdrop onClose={onClose}>
      <section className="log-modal reminder-detail-modal" role="dialog" aria-modal="true">
        {owner ? (
          <form onSubmit={onSave}>
            {heading}
            <label>
              {t("Title")}
              <input name="title" defaultValue={reminder.title} required />
            </label>
            <label>
              {t("Activity")}
              <select name="activityId" defaultValue={reminder.activity_id ?? ""}>
                <option value="">{t("None")}</option>
                {activities.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t(item.name)}
                  </option>
                ))}
              </select>
            </label>
            <ReminderScheduleFields
              locale={locale}
              initialKind={reminder.kind}
              initialIntervalHours={(reminder.interval_minutes ?? 180) / 60}
              initialScheduledFor={reminder.scheduled_for}
            />
            <div className="modal-actions">
              <button className="primary submit">{t("Save changes")}</button>
              <button type="button" className="text-button danger" onClick={onDelete}>
                {t("Delete")}
              </button>
            </div>
          </form>
        ) : (
          <>
            {heading}
            <dl className="event-detail-list">
              <div>
                <dt>{t("Activity")}</dt>
                <dd>{activity ? t(activity.name) : t("None")}</dd>
              </div>
              <div>
                <dt>{t("Schedule")}</dt>
                <dd>{schedule}</dd>
              </div>
            </dl>
          </>
        )}
      </section>
    </ModalBackdrop>
  );
}

function UpcomingList({
  reminders,
  locale,
  owner,
  onOpen,
  onSelect,
  onComplete,
  onDelete,
  onLogActivity,
}: {
  reminders: Reminder[];
  locale: User["locale"];
  owner: boolean;
  onOpen: () => void;
  onSelect: (reminder: Reminder) => void;
  onComplete: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
  onLogActivity?: (activityId: string) => void;
}) {
  const t = (text: string) => translate(locale, text);
  return (
    <section className="upcoming-list" aria-label={t("Upcoming care")}>
      <div className="section-head upcoming-list-head">
        <div>
          <h2>{t("Upcoming")}</h2>
        </div>
        <button className="text-button" onClick={onOpen}>
          {t("Manage reminders")} <Plus size={15} />
        </button>
      </div>
      {reminders.length ? (
        <div className="upcoming-items">
          {reminders.map((reminder) => (
            <article
              className="due-item due-item-open-detail"
              key={reminder.id}
              tabIndex={0}
              role="button"
              onClick={() => onSelect(reminder)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(reminder);
                }
              }}
            >
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
                    ? clock(reminder.scheduled_for, locale)
                    : `${t("Every")} ${Math.round((reminder.interval_minutes ?? 0) / 60)} ${t("hours after activity")}`}
                </p>
              </div>
              <span className="due-actions">
                {onLogActivity && reminder.activity_id && (
                  <button
                    className="due-log"
                    aria-label={`${t("Log activity")} ${reminder.title}`}
                    title={`${t("Log activity")} ${reminder.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onLogActivity(reminder.activity_id!);
                    }}
                  >
                    <ClipboardPlus size={14} />
                  </button>
                )}
                <button
                  className="check"
                  aria-label={`${t("Mark complete")} ${reminder.title}`}
                  title={`${t("Mark complete")} ${reminder.title}`}
                  data-tooltip={t("Mark complete")}
                  onClick={(event) => {
                    event.stopPropagation();
                    onComplete(reminder);
                  }}
                >
                  <Check size={13} />
                </button>
                {owner && (
                  <button
                    className="more"
                    aria-label={`${t("Delete")} ${reminder.title}`}
                    title={`${t("Delete")} ${reminder.title}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(reminder);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <p className="upcoming-empty">
          {t("No upcoming reminders. Add one whenever you need it.")}
        </p>
      )}
    </section>
  );
}

function EventDetailModal({
  event,
  activities,
  locale,
  timeZone,
  onClose,
}: {
  event: Event;
  activities: Activity[];
  locale: User["locale"];
  timeZone: string;
  onClose: () => void;
}) {
  const t = (text: string) => translate(locale, text);
  const eventDate = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(event.event_time));
  return (
    <ModalBackdrop onClose={onClose}>
      <section className="event-detail-modal" role="dialog" aria-modal="true">
        <button type="button" className="close" onClick={onClose} aria-label={t("Close")}>
          <X size={20} />
        </button>
        <div className="event-detail-heading">
          <i style={{ background: event.color }}>{icon(event.kind)}</i>
          <div>
            <h2>{t(event.activity_name)}</h2>
            <p>{eventDate}</p>
          </div>
        </div>
        <dl className="event-detail-list">
          <div>
            <dt>{t("Logged by")}</dt>
            <dd>{event.created_by}</dd>
          </div>
          <div>
            <dt>{t("Details")}</dt>
            <dd>{eventDetail(event, activities, t)}</dd>
          </div>
          {event.note && (
            <div>
              <dt>{t("Note")}</dt>
              <dd>“{event.note}”</dd>
            </div>
          )}
        </dl>
      </section>
    </ModalBackdrop>
  );
}

function LogModal({
  locale,
  activity,
  activities,
  at,
  values,
  portions,
  note,
  editing,
  onClose,
  onActivity,
  onAt,
  onValues,
  onPortions,
  onNote,
  onSubmit,
}: {
  locale: User["locale"];
  activity?: Activity;
  activities: Activity[];
  at: string;
  values: Record<string, unknown>;
  portions: FeedingPortionDraft[];
  note: string;
  editing: boolean;
  onClose: () => void;
  onActivity: (id: string) => void;
  onAt: (value: string) => void;
  onValues: (value: Record<string, unknown>) => void;
  onPortions: (value: FeedingPortionDraft[]) => void;
  onNote: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const t = (text: string) => translate(locale, text);
  return (
    <ModalBackdrop onClose={onClose}>
      <form className="log-modal" onSubmit={onSubmit}>
        <button type="button" className="close" onClick={onClose}>
          <X size={20} />
        </button>
        <p className="eyebrow">{t("QUICK LOG")}</p>
        <h2>{t(editing ? "Edit care record" : "What happened?")}</h2>
        <div className="activity-picker">
          {activities.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === activity?.id ? "selected" : ""}
              onClick={() => onActivity(item.id)}
            >
              <i style={{ background: item.color }}>{icon(item.kind)}</i>
              {t(item.name)}
            </button>
          ))}
        </div>
        <label>
          {t("When")}
          <input
            type="datetime-local"
            value={at}
            onChange={(event) => onAt(event.target.value)}
            required
          />
        </label>
        {activity?.kind === "feeding" ? (
          <fieldset className="feeding-portions">
            <legend>{t("Milk portions")}</legend>
            {portions.map((portion, index) => (
              <div className="feeding-portion" key={index}>
                <select
                  aria-label={t("Milk type")}
                  value={portion.kind}
                  onChange={(event) =>
                    onPortions(
                      portions.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              kind: event.target
                                .value as FeedingPortion["kind"],
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="breast_milk">{t("Breast milk")}</option>
                  <option value="formula">{t("Formula")}</option>
                </select>
                <select
                  aria-label={t("Feeding method")}
                  value={portion.deliveryMethod}
                  onChange={(event) =>
                    onPortions(
                      portions.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              deliveryMethod: event.target
                                .value as FeedingPortion["delivery_method"],
                            }
                          : item,
                      ),
                    )
                  }
                >
                  <option value="bottle">{t("Bottle")}</option>
                  <option value="breastfeeding">{t("Breastfeeding")}</option>
                </select>
                <label>
                  <span className="sr-only">{t("Amount in ml")}</span>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    required
                    value={portion.amountMl}
                    onChange={(event) =>
                      onPortions(
                        portions.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, amountMl: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <span className="field-unit">ml</span>
                </label>
                {portions.length > 1 && (
                  <button
                    className="portion-remove"
                    type="button"
                    aria-label={t("Remove portion")}
                    onClick={() =>
                      onPortions(
                        portions.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}
            <button
              className="text-button add-portion"
              type="button"
              onClick={() =>
                onPortions([
                  ...portions,
                  { kind: "formula", deliveryMethod: "bottle", amountMl: "" },
                ])
              }
            >
              <Plus size={15} /> {t("Add portion")}
            </button>
          </fieldset>
        ) : (
          activity?.fields.map((field) => (
            <label key={field.id}>
              {t(field.label)}
              {field.unit ? ` (${field.unit})` : ""}
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
                    onValues({
                      ...values,
                      [field.field_key]: event.target.value,
                    })
                  }
                >
                  {field.options.map((option) => (
                    <option key={option}>{t(option)}</option>
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
                    onValues({
                      ...values,
                      [field.field_key]: event.target.value,
                    })
                  }
                />
              )}
            </label>
          ))
        )}
        <label>
          {t("Note")}
          <textarea
            value={note}
            onChange={(event) => onNote(event.target.value)}
            placeholder={t("Optional context for everyone")}
          />
        </label>
        <button className="primary submit log-submit">
          {t(editing ? "Save changes" : "Save")}
        </button>
      </form>
    </ModalBackdrop>
  );
}

function HomeSidebar({
  user,
  onHome,
  onOpenLanguage,
  onSignOut,
}: {
  user: User;
  onHome: () => void;
  onOpenLanguage: () => void;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  usePageScrollLock(open);
  const close = () => setOpen(false);
  const t = (text: string) => translate(user.locale, text);
  return (
    <>
      <button
        className="home-menu"
        aria-label={t("Open navigation")}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu size={21} />
      </button>
      <button
        className={`home-sidebar-scrim ${open ? "visible" : ""}`}
        aria-label={t("Close navigation")}
        onClick={close}
      />
      <aside className={`home-sidebar ${open ? "open" : ""}`}>
        <NurtureBrand onClick={onHome} />
        <div className="sidebar-bottom">
          <LanguageControl
            locale={user.locale}
            label={t("Language")}
            onClick={() => {
              close();
              onOpenLanguage();
            }}
          />
          <SidebarAccount
            displayName={user.display_name}
            signOutLabel={t("Sign out")}
            onSignOut={onSignOut}
          />
        </div>
      </aside>
    </>
  );
}

function Home({
  user,
  error,
  createChildOpen,
  onCreate,
  onCloseCreate,
  onCreateChild,
  languageOpen,
  onOpenLanguage,
  onCloseLanguage,
  onLocale,
  onSignOut,
  onHome,
}: {
  user: User;
  error: string;
  createChildOpen: boolean;
  onCreate: () => void;
  onCloseCreate: () => void;
  onCreateChild: (event: FormEvent<HTMLFormElement>) => void;
  languageOpen: boolean;
  onOpenLanguage: () => void;
  onCloseLanguage: () => void;
  onLocale: (locale: User["locale"]) => void;
  onSignOut: () => void;
  onHome: () => void;
}) {
  const t = (text: string) => translate(user.locale, text);
  return (
    <main className="home-shell">
      <HomeSidebar
        user={user}
        onHome={onHome}
        onOpenLanguage={onOpenLanguage}
        onSignOut={onSignOut}
      />
      <section className="empty-home">
        <p className="eyebrow">{t("YOUR FAMILY SPACE")}</p>
        <h1>
          {t("Everything starts when")}
          <br />
          {t("you’re ready.")}
        </h1>
        <p>
          {t(
            "There are no child profiles in your family space yet. Create one whenever you want to begin tracking care.",
          )}
        </p>
        <button className="primary home-create" onClick={onCreate}>
          <Plus size={18} />
          {t("Create child")}
        </button>
      </section>
      {createChildOpen && (
        <CreateChildModal
          error={error}
          locale={user.locale}
          onClose={onCloseCreate}
          onSubmit={onCreateChild}
        />
      )}
      {languageOpen && (
        <LanguagePicker
          locale={user.locale}
          onClose={onCloseLanguage}
          onSelect={onLocale}
        />
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
  languageOpen,
  onOpenLanguage,
  onCloseLanguage,
  onLocale,
  onSignOut,
  onHome,
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
  languageOpen: boolean;
  onOpenLanguage: () => void;
  onCloseLanguage: () => void;
  onLocale: (locale: User["locale"]) => void;
  onSignOut: () => void;
  onHome: () => void;
}) {
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const t = (text: string) => translate(user.locale, text);
  return (
    <main className="home-shell">
      <HomeSidebar
        user={user}
        onHome={onHome}
        onOpenLanguage={onOpenLanguage}
        onSignOut={onSignOut}
      />
      <section className="children-home">
        <div className="children-home-heading">
          <div>
            <p className="eyebrow">{t("YOUR FAMILY SPACE")}</p>
            <h1>{t("Children")}</h1>
            <p>{t("Select a child to open their care timeline.")}</p>
          </div>
          <button className="primary" onClick={onCreate}>
            <Plus size={18} />
            {t("Add child")}
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
                  <strong>
                    <bdi>{item.name}</bdi>
                  </strong>
                  <small className="child-meta">
                    {user.locale === "he" ? (
                      <>
                        <span>{t(item.role)}</span>
                        <span>·</span>
                        <bdi dir="rtl">
                          {timeZoneLabel(item.timezone, user.locale)}
                        </bdi>
                      </>
                    ) : (
                      <>
                        <bdi dir="ltr">
                          {timeZoneLabel(item.timezone, user.locale)}
                        </bdi>
                        <span>·</span>
                        <span>{t(item.role)}</span>
                      </>
                    )}
                  </small>
                </span>
                <span className="child-row-arrow">→</span>
              </button>
              {item.role === "owner" && (
                <div className="child-actions">
                  <button
                    className="more child-more"
                    title={`${t("Actions for")} ${item.name}`}
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
                        {t("Edit")}
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          setActionsFor(null);
                          onDeleteChild(item);
                        }}
                      >
                        {t("Delete")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      {createChildOpen && (
        <CreateChildModal
          error={error}
          locale={user.locale}
          onClose={onCloseCreate}
          onSubmit={onCreateChild}
        />
      )}
      {languageOpen && (
        <LanguagePicker
          locale={user.locale}
          onClose={onCloseLanguage}
          onSelect={onLocale}
        />
      )}
    </main>
  );
}

function ManageModal({
  locale,
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
  locale: User["locale"];
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
  const t = (text: string) => translate(locale, text);
  const [inviteMethod, setInviteMethod] = useState<"email" | "link">("email");
  const fields = (
    <>
      <label>
        {t("Field type")}
        <select name="type">
          <option value="number">{t("Number")}</option>
          <option value="text">{t("Text")}</option>
          <option value="boolean">{t("Yes / no")}</option>
          <option value="select">{t("Single select")}</option>
          <option value="duration">{t("Duration")}</option>
        </select>
      </label>
      <label>
        {t("Unit")}
        <input name="unit" placeholder={t("e.g. ml, °C")} />
      </label>
      <label>
        {t("Options for a select")}
        <input name="options" placeholder={t("e.g. left, right")} />
      </label>
    </>
  );
  return (
    <ModalBackdrop onClose={onClose}>
      <section className="log-modal manager">
        <button className="close" onClick={onClose}>
          <X size={20} />
        </button>
        {panel === "activity" && (
          <>
            <form onSubmit={onActivity}>
              <h2>{t("Custom activity")}</h2>
              <label>
                {t("Name")}
                <input name="name" required placeholder={t("e.g. Bath")} />
              </label>
              <label>
                {t("First field (optional)")}
                <input name="field" placeholder={t("e.g. Temperature")} />
              </label>
              {fields}
              <button className="primary submit">{t("Create activity")}</button>
            </form>
            <form onSubmit={onField}>
              <h3>{t("Add a field")}</h3>
              <label>
                {t("Activity")}
                <select name="activityId">
                  {activities.map((activity) => (
                    <option key={activity.id} value={activity.id}>
                      {t(activity.name)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("Field name")}
                <input name="field" required />
              </label>
              {fields}
              <button className="text-button">{t("Add field")}</button>
            </form>
            {owner && (
              <div className="note-list">
                {activities.map((activity) => (
                  <article key={activity.id}>
                    <strong>{t(activity.name)}</strong>
                    <button
                      className="text-button danger"
                      onClick={() => onArchive(activity.id)}
                    >
                      {t("Remove activity")}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </>
        )}
        {panel === "reminder" && (
          <form onSubmit={onReminder}>
            <h2>{t("Add reminder")}</h2>
            <label>
              {t("Title")}
              <input name="title" required />
            </label>
            <label>
              {t("Activity")}
              <select name="activityId">
                <option value="">{t("None")}</option>
                {activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {t(activity.name)}
                  </option>
                ))}
              </select>
            </label>
            <ReminderScheduleFields locale={locale} />
            <button className="primary submit">{t("Save reminder")}</button>
          </form>
        )}
        {panel === "gap" && (
          <form onSubmit={onGap}>
            <h2>{t("Declare care gap")}</h2>
            <p className="time-hint">
              {t(
                "Logs in or across this range do not affect interval analytics.",
              )}
            </p>
            <label>
              {t("Start")}
              <input name="start" type="datetime-local" required />
            </label>
            <label>
              {t("End")}
              <input name="end" type="datetime-local" required />
            </label>
            <label>
              {t("Reason")}
              <input name="reason" placeholder={t("Shabbat")} />
            </label>
            <button className="primary submit">{t("Declare gap")}</button>
          </form>
        )}
        {panel === "invite" && (
          <form onSubmit={onInvite}>
            <h2>{t("Invite caregiver")}</h2>
            <div
              className="invite-methods"
              role="group"
              aria-label={t("Invitation method")}
            >
              <button
                className={inviteMethod === "email" ? "selected" : ""}
                type="button"
                onClick={() => setInviteMethod("email")}
              >
                {t("Invite by email")}
              </button>
              <button
                className={inviteMethod === "link" ? "selected" : ""}
                type="button"
                onClick={() => setInviteMethod("link")}
              >
                {t("Invite by link")}
              </button>
            </div>
            {inviteMethod === "email" ? (
              <label>
                {t("Email")}
                <input name="email" type="email" required />
              </label>
            ) : (
              <p className="time-hint">
                {t("The link works once and expires in 7 days.")}
              </p>
            )}
            <label>
              {t("Role")}
              <select name="role">
                <option value="caregiver">{t("Caregiver")}</option>
                <option value="viewer">{t("Viewer")}</option>
              </select>
            </label>
            <button className="primary submit">
              {t(inviteMethod === "link" ? "Create link" : "Create invitation")}
            </button>
            {inviteUrl && (
              <div className="invite-link">
                <label>
                  {t("Invitation link")}
                  <span className="invite-link-input">
                    <textarea readOnly value={inviteUrl} />
                    <button
                      className="invite-copy"
                      type="button"
                      aria-label={t("Copy link")}
                      title={t("Copy link")}
                      onClick={() => navigator.clipboard.writeText(inviteUrl)}
                    >
                      <Copy size={16} />
                    </button>
                  </span>
                </label>
              </div>
            )}
          </form>
        )}
        {panel === "notes" && (
          <>
            <form onSubmit={onNote}>
              <h2>{t("Notes")}</h2>
              <label>
                {t("New note")}
                <textarea name="body" required />
              </label>
              <label>
                {t("Visibility")}
                <select name="visibility">
                  <option value="shared">{t("Shared")}</option>
                  <option value="private">{t("Private")}</option>
                </select>
              </label>
              <button className="primary submit">{t("Save note")}</button>
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
            <h2>{t("Children")}</h2>
            <div className="note-list">
              {children.map((child) => (
                <article key={child.id}>
                  <strong>{child.name}</strong>
                  <p>
                    {t("Your role:")} {t(child.role)}
                  </p>
                  {child.role === "owner" && (
                    <button
                      className="text-button"
                      onClick={() => onRenameChild(child)}
                    >
                      {t("Rename")}
                    </button>
                  )}
                </article>
              ))}
            </div>
            <form onSubmit={onChild}>
              <h3>{t("Add another child")}</h3>
              <label>
                {t("Name")}
                <input name="name" required />
              </label>
              <label>
                {t("Timezone")}
                <TimezoneSelect locale={locale} />
              </label>
              <label>
                {t("Birth date")}
                <input name="birthDate" type="date" />
              </label>
              <button className="text-button">{t("Create child")}</button>
            </form>
            {owner && (
              <p className="time-hint">
                {t("Use Invite caregiver from the right panel to add people.")}
              </p>
            )}
          </>
        )}
      </section>
    </ModalBackdrop>
  );
}

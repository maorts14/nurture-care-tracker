import { FormEvent, useState } from "react";
import { CalendarClock, Menu, Pencil, Plus, Trash2, X } from "lucide-react";
import { InteractiveRow } from "./components/InteractiveRow";
import { ModalBackdrop } from "./components/ModalBackdrop";
import { ReminderScheduleFields } from "./components/ReminderScheduleFields";
import { TimelineBackButton } from "./components/TimelineBackButton";
import { Locale, translate } from "./i18n";

type ActivityField = {
  id: string;
  field_key: string;
  label: string;
  field_type: "text" | "number" | "boolean" | "select" | "duration";
  unit?: string;
  options: string[];
};

type ActivitySchedule = {
  kind: "interval" | "one_time";
  interval_minutes?: number;
  scheduled_for?: string;
};

type Activity = {
  id: string;
  name: string;
  kind: "feeding" | "diaper" | "custom";
  color: string;
  fields: ActivityField[];
  schedule: ActivitySchedule | null;
};

type Props = {
  locale: Locale;
  activities: Activity[];
  canManage: boolean;
  onBack: () => void;
  onOpenNavigation: () => void;
  onCreateActivity: (event: FormEvent<HTMLFormElement>) => void;
  onUpdateActivity: (event: FormEvent<HTMLFormElement>) => void;
  onArchiveActivity: (activityId: string) => void;
  onAddField: (event: FormEvent<HTMLFormElement>) => void;
  onSaveSchedule: (activity: Activity, event: FormEvent<HTMLFormElement>) => void;
  onDeleteSchedule: (activity: Activity) => void;
};

function scheduleDescription(schedule: ActivitySchedule, locale: Locale, t: (text: string) => string) {
  if (schedule.kind === "one_time" && schedule.scheduled_for) {
    return new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(schedule.scheduled_for));
  }
  return `${t("Every")} ${Math.round((schedule.interval_minutes ?? 0) / 60)} ${t("hours after activity")}`;
}

export function ActivitiesRemindersPage({
  locale,
  activities,
  canManage,
  onBack,
  onOpenNavigation,
  onCreateActivity,
  onUpdateActivity,
  onArchiveActivity,
  onAddField,
  onSaveSchedule,
  onDeleteSchedule,
}: Props) {
  const [creatingActivity, setCreatingActivity] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [schedulingActivity, setSchedulingActivity] = useState<Activity | null>(null);
  const t = (text: string) => translate(locale, text);

  return (
    <section className="activities-reminders-page">
      <div className="page-navigation-row">
        <TimelineBackButton locale={locale} onClick={onBack} />
        <button className="mobile-menu" aria-label={t("Open navigation")} onClick={onOpenNavigation}>
          <Menu size={21} />
        </button>
      </div>
      <header className="activities-reminders-heading">
        <div>
          <h1>{t("Activities & reminders")}</h1>
          <p>{t("Create activities, then add a recurring or one-time reminder to the activity that needs it.")}</p>
        </div>
        {canManage && (
          <button className="primary" onClick={() => setCreatingActivity(true)}>
            <Plus size={18} />
            {t("Add activity")}
          </button>
        )}
      </header>
      <section className="activities-reminders-list" aria-label={t("Activities & reminders")}>
        {activities.map((activity) => (
          <InteractiveRow
            key={activity.id}
            className="activity-schedule-row"
            openLabel={`${t("Edit")} ${t(activity.name)}`}
            onOpen={canManage ? () => setEditingActivity(activity) : undefined}
            actions={canManage ? (
              <>
                <button
                  className="text-button"
                  onClick={() => setSchedulingActivity(activity)}
                >
                  <CalendarClock size={16} />
                  {t(activity.schedule ? "Edit reminder" : "Add reminder")}
                </button>
                <button
                  className="more"
                  aria-label={`${t("Edit")} ${t(activity.name)}`}
                  title={t("Edit")}
                  onClick={() => setEditingActivity(activity)}
                >
                  <Pencil size={16} />
                </button>
              </>
            ) : undefined}
          >
            <span className="activity-schedule-dot" style={{ background: activity.color }} />
            <div className="activity-schedule-summary">
              <h2>{t(activity.name)}</h2>
              <p>
                {activity.kind === "custom"
                  ? activity.fields.length
                    ? `${activity.fields.length} ${t("fields")}`
                    : t("Custom activity")
                  : t(activity.kind === "feeding" ? "Feeding" : "Diaper change")}
              </p>
            </div>
            <div className="activity-schedule-status">
              <span>{t("Reminder")}</span>
              {activity.schedule ? (
                <strong>
                  {activity.schedule.kind === "one_time" ? t("One time") : t("Recurring")}
                  <small>{scheduleDescription(activity.schedule, locale, t)}</small>
                </strong>
              ) : (
                <strong className="activity-schedule-empty">{t("No reminder yet")}</strong>
              )}
            </div>
          </InteractiveRow>
        ))}
      </section>
      {creatingActivity && (
        <ModalBackdrop onClose={() => setCreatingActivity(false)}>
          <form
            className="log-modal activity-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t("Add activity")}
            onSubmit={(event) => {
              onCreateActivity(event);
              setCreatingActivity(false);
            }}
          >
            <button className="close" type="button" aria-label={t("Close")} onClick={() => setCreatingActivity(false)}>
              <X size={20} />
            </button>
            <h2>{t("Add activity")}</h2>
            <label>
              {t("Name")}
              <input name="name" required placeholder={t("e.g. Bath")} />
            </label>
            <label>
              {t("First field (optional)")}
              <input name="field" placeholder={t("e.g. Temperature")} />
            </label>
            <ActivityFieldInputs t={t} />
            <button className="primary submit">{t("Create activity")}</button>
          </form>
        </ModalBackdrop>
      )}
      {editingActivity && (
        <ModalBackdrop onClose={() => setEditingActivity(null)}>
          <section className="log-modal activity-editor-modal" role="dialog" aria-modal="true" aria-label={t(editingActivity.name)}>
            <button className="close" type="button" aria-label={t("Close")} onClick={() => setEditingActivity(null)}>
              <X size={20} />
            </button>
            <form onSubmit={onUpdateActivity}>
              <h2>{t(editingActivity.name)}</h2>
              <input type="hidden" name="activityId" value={editingActivity.id} />
              <label>
                {t("Name")}
                <input name="name" defaultValue={editingActivity.name} required />
              </label>
              <label>
                {t("Color")}
                <input name="color" type="color" defaultValue={editingActivity.color} />
              </label>
              <div className="modal-actions">
                <button className="primary submit">{t("Save changes")}</button>
                <button className="text-button danger" type="button" onClick={() => {
                  onArchiveActivity(editingActivity.id);
                  setEditingActivity(null);
                }}>
                  <Trash2 size={16} />
                  {t("Remove activity")}
                </button>
              </div>
            </form>
            {editingActivity.kind === "custom" && (
              <form className="activity-field-form" onSubmit={onAddField}>
                <h3>{t("Add a field")}</h3>
                <input type="hidden" name="activityId" value={editingActivity.id} />
                <label>
                  {t("Field name")}
                  <input name="field" required />
                </label>
                <ActivityFieldInputs t={t} />
                <button className="text-button">{t("Add field")}</button>
              </form>
            )}
          </section>
        </ModalBackdrop>
      )}
      {schedulingActivity && (
        <ModalBackdrop onClose={() => setSchedulingActivity(null)}>
          <form
            className="log-modal activity-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`${t("Reminder")} ${t(schedulingActivity.name)}`}
            onSubmit={(event) => {
              onSaveSchedule(schedulingActivity, event);
              setSchedulingActivity(null);
            }}
          >
            <button className="close" type="button" aria-label={t("Close")} onClick={() => setSchedulingActivity(null)}>
              <X size={20} />
            </button>
            <h2>{t(schedulingActivity.name)}</h2>
            <p className="activity-schedule-modal-copy">{t("Reminder")}</p>
            <ReminderScheduleFields
              locale={locale}
              initialKind={schedulingActivity.schedule?.kind}
              initialIntervalHours={(schedulingActivity.schedule?.interval_minutes ?? 180) / 60}
              initialScheduledFor={schedulingActivity.schedule?.scheduled_for}
            />
            <div className="modal-actions">
              <button className="primary submit">{t("Save reminder")}</button>
              {schedulingActivity.schedule && (
                <button className="text-button danger" type="button" onClick={() => {
                  onDeleteSchedule(schedulingActivity);
                  setSchedulingActivity(null);
                }}>
                  <Trash2 size={16} />
                  {t("Delete")}
                </button>
              )}
            </div>
          </form>
        </ModalBackdrop>
      )}
    </section>
  );
}

function ActivityFieldInputs({ t }: { t: (text: string) => string }) {
  return (
    <>
      <label>
        {t("Field type")}
        <select name="type" defaultValue="text">
          <option value="text">{t("Text")}</option>
          <option value="number">{t("Number")}</option>
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
}

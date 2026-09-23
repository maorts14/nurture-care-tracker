import { FormEvent, useState } from "react";
import { CalendarClock, Menu, Pencil, Plus, Trash2, X } from "lucide-react";
import { InteractiveRow } from "./components/InteractiveRow";
import { ModalBackdrop } from "./components/ModalBackdrop";
import { ReminderScheduleFields } from "./components/ReminderScheduleFields";
import { TimelineBackButton } from "./components/TimelineBackButton";
import { ActivityIcon, customActivityIcons } from "./components/ActivityIcon";
import { Locale, translate } from "./i18n";

type ActivityField = {
  id: string;
  field_key: string;
  label: string;
  field_type: "text" | "number" | "boolean" | "select" | "duration";
  unit?: string;
  options: string[];
  boolean_true_label?: string | null;
  boolean_false_label?: string | null;
};

export type ActivityFieldDraft = {
  id?: string;
  field_key?: string;
  label: string;
  field_type: ActivityField["field_type"];
  unit?: string;
  options: string[];
  boolean_true_label?: string;
  boolean_false_label?: string;
};

export type ActivityEditorInput = {
  id?: string;
  name: string;
  color?: string;
  icon: string;
  fields?: ActivityFieldDraft[];
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
  icon: string;
  fields: ActivityField[];
  schedule: ActivitySchedule | null;
};

type Props = {
  locale: Locale;
  activities: Activity[];
  canManage: boolean;
  onBack: () => void;
  onOpenNavigation: () => void;
  onCreateActivity: (input: ActivityEditorInput) => Promise<void>;
  onUpdateActivity: (input: ActivityEditorInput) => Promise<void>;
  onArchiveActivity: (activityId: string) => void;
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
  onSaveSchedule,
  onDeleteSchedule,
}: Props) {
  const [creatingActivity, setCreatingActivity] = useState(false);
  const [creatingFields, setCreatingFields] = useState<ActivityFieldDraft[]>([]);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editingFields, setEditingFields] = useState<ActivityFieldDraft[]>([]);
  const [schedulingActivity, setSchedulingActivity] = useState<Activity | null>(null);
  const t = (text: string) => translate(locale, text);
  const openActivityEditor = (activity: Activity) => {
    setEditingActivity(activity);
    setEditingFields(activity.fields.map((field) => ({
      ...field,
      boolean_true_label: field.boolean_true_label ?? undefined,
      boolean_false_label: field.boolean_false_label ?? undefined,
    })));
  };

  return (
    <section className="activities-reminders-page">
      <div className="page-navigation-row">
        <button className="mobile-menu" aria-label={t("Open navigation")} onClick={onOpenNavigation}>
          <Menu size={21} />
        </button>
        <TimelineBackButton locale={locale} onClick={onBack} />
      </div>
      <header className="activities-reminders-heading">
        <div>
          <h1>{t("Activities & reminders")}</h1>
          <p>{t("Create activities, then add a recurring or one-time reminder to the activity that needs it.")}</p>
        </div>
        {canManage && (
          <button className="primary" onClick={() => {
            setCreatingFields([]);
            setCreatingActivity(true);
          }}>
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
            onOpen={canManage ? () => openActivityEditor(activity) : undefined}
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
                  className="more danger"
                  aria-label={`${t("Remove activity")} ${t(activity.name)}`}
                  title={t("Remove activity")}
                  onClick={() => onArchiveActivity(activity.id)}
                >
                  <Trash2 size={16} />
                </button>
                <button
                  className="more"
                  aria-label={`${t("Edit")} ${t(activity.name)}`}
                  title={t("Edit")}
                  onClick={() => openActivityEditor(activity)}
                >
                  <Pencil size={16} />
                </button>
              </>
            ) : undefined}
          >
            <span
              className="activity-schedule-icon"
              style={{ background: activity.color }}
              aria-hidden="true"
            >
              <ActivityIcon kind={activity.kind} icon={activity.icon} size={16} />
            </span>
            <div className="activity-schedule-summary">
              <h2>{t(activity.name)}</h2>
              {activity.kind === "custom" && (
                <p>
                  {activity.fields.length
                    ? `${activity.fields.length} ${t("fields")}`
                    : t("Custom activity")}
                </p>
              )}
            </div>
            <div className="activity-schedule-status">
              {activity.schedule ? (
                <strong>
                  {activity.schedule.kind === "one_time"
                    ? t("One-time reminder")
                    : t("Recurring reminder")}
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
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await onCreateActivity({
                name: String(form.get("name")),
                icon: String(form.get("icon")),
                fields: creatingFields,
              });
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
            <ActivityIconPicker locale={locale} />
            <ActivityFieldsEditor locale={locale} fields={creatingFields} onChange={setCreatingFields} />
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
            <form onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await onUpdateActivity({
                id: editingActivity.id,
                name: String(form.get("name")),
                color: String(form.get("color")),
                icon: String(form.get("icon") ?? editingActivity.icon),
                fields: editingFields,
              });
              setEditingActivity(null);
            }}>
              <h2>{t(editingActivity.name)}</h2>
              <input type="hidden" name="activityId" value={editingActivity.id} />
              <label>
                {t("Name")}
                <input name="name" defaultValue={editingActivity.name} required />
              </label>
              <div className="activity-color-field">
                <span id="activity-color-label">{t("Color")}</span>
                <input
                  aria-labelledby="activity-color-label"
                  name="color"
                  type="color"
                  defaultValue={editingActivity.color}
                />
              </div>
              <ActivityIconPicker locale={locale} initialIcon={editingActivity.icon} />
              <ActivityFieldsEditor locale={locale} fields={editingFields} onChange={setEditingFields} />
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

function ActivityIconPicker({
  locale,
  initialIcon = "heart-pulse",
}: {
  locale: Locale;
  initialIcon?: string;
}) {
  const [icon, setIcon] = useState(initialIcon);
  const t = (text: string) => translate(locale, text);
  return (
    <fieldset className="activity-icon-picker">
      <legend>{t("Icon")}</legend>
      <input type="hidden" name="icon" value={icon} />
      <div role="radiogroup" aria-label={t("Icon")}>
        {customActivityIcons.map((option) => (
          <button
            key={option.key}
            type="button"
            className={icon === option.key ? "selected" : ""}
            role="radio"
            aria-checked={icon === option.key}
            aria-label={locale === "he" ? option.hebrewLabel : option.label}
            title={locale === "he" ? option.hebrewLabel : option.label}
            onClick={() => setIcon(option.key)}
          >
            <option.icon size={18} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ActivityFieldsEditor({
  locale,
  fields,
  onChange,
}: {
  locale: Locale;
  fields: ActivityFieldDraft[];
  onChange: (fields: ActivityFieldDraft[]) => void;
}) {
  const t = (text: string) => translate(locale, text);
  const updateField = (index: number, patch: Partial<ActivityFieldDraft>) => {
    onChange(fields.map((field, fieldIndex) => fieldIndex === index ? { ...field, ...patch } : field));
  };
  const addField = () => {
    onChange([
      ...fields,
      { label: "", field_type: "text", options: [] },
    ]);
  };
  return (
    <fieldset className="activity-fields-editor">
      <legend className="activity-fields-editor-title">
        <span>{t("Fields")}</span>
        <button className="text-button" type="button" onClick={addField}>
          <Plus size={16} /> {t("Add field")}
        </button>
      </legend>
      {fields.map((field, index) => (
        <article className="activity-field-editor" key={field.id ?? `${field.field_key ?? "new"}-${index}`}>
          <div className="activity-field-editor-heading">
            <strong>{t("Field")} {index + 1}</strong>
            <button
              className="more danger"
              type="button"
              aria-label={`${t("Remove field")} ${index + 1}`}
              title={t("Remove field")}
              onClick={() => onChange(fields.filter((_, fieldIndex) => fieldIndex !== index))}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="activity-field-editor-grid">
            <label>
              {t("Field name")}
              <input
                value={field.label}
                required
                onChange={(event) => updateField(index, { label: event.target.value })}
              />
            </label>
            <label>
              {t("Field type")}
              <select
                value={field.field_type}
                onChange={(event) => {
                  const field_type = event.target.value as ActivityFieldDraft["field_type"];
                  updateField(index, {
                    field_type,
                    unit: field_type === "number" || field_type === "duration" ? field.unit : undefined,
                    options: field_type === "select" ? field.options : [],
                    boolean_true_label: field_type === "boolean" ? field.boolean_true_label : undefined,
                    boolean_false_label: field_type === "boolean" ? field.boolean_false_label : undefined,
                  });
                }}
              >
                <option value="text">{t("Text")}</option>
                <option value="number">{t("Number")}</option>
                <option value="boolean">{t("Yes / no")}</option>
                <option value="select">{t("Single select")}</option>
                <option value="duration">{t("Duration")}</option>
              </select>
            </label>
          </div>
          {(field.field_type === "number" || field.field_type === "duration") && (
            <label>
              {t("Unit (optional)")}
              <input
                value={field.unit ?? ""}
                placeholder={field.field_type === "duration" ? t("e.g. minutes") : t("e.g. ml, °C")}
                onChange={(event) => updateField(index, { unit: event.target.value })}
              />
            </label>
          )}
          {field.field_type === "select" && (
            <label>
              {t("Choices")}
              <input
                required
                value={field.options.join(", ")}
                placeholder={t("e.g. left, right")}
                onChange={(event) => updateField(index, {
                  options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean),
                })}
              />
            </label>
          )}
          {field.field_type === "boolean" && (
            <div className="activity-field-editor-grid">
              <label>
                {t("Yes label (optional)")}
                <input
                  value={field.boolean_true_label ?? ""}
                  placeholder={t("Yes")}
                  onChange={(event) => updateField(index, { boolean_true_label: event.target.value })}
                />
              </label>
              <label>
                {t("No label (optional)")}
                <input
                  value={field.boolean_false_label ?? ""}
                  placeholder={t("No")}
                  onChange={(event) => updateField(index, { boolean_false_label: event.target.value })}
                />
              </label>
            </div>
          )}
        </article>
      ))}
    </fieldset>
  );
}

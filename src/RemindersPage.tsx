import { FormEvent } from "react";
import { Check, Pencil, Trash2 } from "lucide-react";
import { DetailPageHeader } from "./components/DetailPageHeader";
import { Locale, translate } from "./i18n";

type Reminder = {
  id: string;
  kind: "interval" | "one_time";
  interval_minutes?: number;
  scheduled_for?: string;
  title: string;
  activity_id?: string;
};
type Activity = { id: string; name: string };
type Props = {
  locale: Locale;
  reminders: Reminder[];
  activities: Activity[];
  owner: boolean;
  onClose: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (reminder: Reminder) => void;
  onComplete: (reminder: Reminder) => void;
  onDelete: (reminder: Reminder) => void;
};

export function RemindersPage({
  locale,
  reminders,
  activities,
  owner,
  onClose,
  onCreate,
  onEdit,
  onComplete,
  onDelete,
}: Props) {
  const t = (text: string) => translate(locale, text);
  return (
    <main className="detail-page">
      <DetailPageHeader
        eyebrow={t("PASSIVE IN-APP REMINDERS")}
        title={t("Upcoming care")}
        backLabel={t("← Timeline")}
        onBack={onClose}
      >
        <p>
          {t(
            "Recurring reminders reset from the most recent matching activity.",
          )}
        </p>
      </DetailPageHeader>
      {owner && (
        <form className="detail-form" onSubmit={onCreate}>
          <label>
            {t("Title")}
            <input name="title" required placeholder={t("e.g. Vitamin D")} />
          </label>
          <label>
            {t("Activity")}
            <select name="activityId">
              <option value="">{t("None")}</option>
              {activities.map((activity) => (
                <option key={activity.id} value={activity.id}>
                  {activity.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("Schedule")}
            <select name="kind">
              <option value="interval">
                {t("Repeat after last activity")}
              </option>
              <option value="one_time">{t("One time")}</option>
            </select>
          </label>
          <label>
            {t("Interval hours")}
            <input name="hours" type="number" min="1" defaultValue="3" />
          </label>
          <label>
            {t("One-time date/time")}
            <input name="when" type="datetime-local" />
          </label>
          <button className="primary">{t("Save reminder")}</button>
        </form>
      )}
      <section className="detail-list">
        {reminders.map((reminder) => (
          <article key={reminder.id}>
            <strong>{reminder.title}</strong>
            <p>
              {reminder.kind === "interval"
                ? `${t("Every")} ${Math.round((reminder.interval_minutes ?? 0) / 60)} ${t("hours after activity")}`
                : new Date(reminder.scheduled_for ?? "").toLocaleString()}
            </p>
            <div className="inline-actions">
              <button onClick={() => onComplete(reminder)}>
                <Check size={14} />
                {t("Complete")}
              </button>
              {owner && (
                <>
                  <button onClick={() => onEdit(reminder)}>
                    <Pencil size={14} />
                    {t("Edit")}
                  </button>
                  <button className="danger" onClick={() => onDelete(reminder)}>
                    <Trash2 size={14} />
                    {t("Delete")}
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

import { useState } from "react";
import { Locale, translate } from "../i18n";

type ReminderScheduleFieldsProps = {
  locale: Locale;
  initialKind?: "interval" | "one_time";
  initialIntervalHours?: number;
  initialScheduledFor?: string;
};

export function ReminderScheduleFields({
  locale,
  initialKind = "interval",
  initialIntervalHours = 3,
  initialScheduledFor,
}: ReminderScheduleFieldsProps) {
  const [oneTime, setOneTime] = useState(initialKind === "one_time");
  const t = (text: string) => translate(locale, text);
  const initialWhen = initialScheduledFor
    ? (() => {
        const date = new Date(initialScheduledFor);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        return date.toISOString().slice(0, 16);
      })()
    : undefined;

  return (
    <>
      <input name="kind" type="hidden" value={oneTime ? "one_time" : "interval"} />
      <label className="reminder-one-time">
        <span>{t("One-time reminder")}</span>
        <input
          type="checkbox"
          checked={oneTime}
          onChange={(event) => setOneTime(event.target.checked)}
        />
      </label>
      <label className={oneTime ? "reminder-schedule-field is-disabled" : "reminder-schedule-field"}>
        {t("Interval hours")}
        <input
          name="hours"
          type="number"
          min="1"
          defaultValue={initialIntervalHours}
          disabled={oneTime}
          required={!oneTime}
        />
      </label>
      <label className={oneTime ? "reminder-schedule-field" : "reminder-schedule-field is-disabled"}>
        {t("One-time date/time")}
        <input
          name="when"
          type="datetime-local"
          defaultValue={initialWhen}
          disabled={!oneTime}
          required={oneTime}
        />
      </label>
    </>
  );
}

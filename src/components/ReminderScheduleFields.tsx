import { useState } from "react";
import { Locale, translate } from "../i18n";

type ReminderScheduleFieldsProps = {
  locale: Locale;
};

export function ReminderScheduleFields({
  locale,
}: ReminderScheduleFieldsProps) {
  const [oneTime, setOneTime] = useState(false);
  const t = (text: string) => translate(locale, text);

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
          defaultValue="3"
          disabled={oneTime}
          required={!oneTime}
        />
      </label>
      <label className={oneTime ? "reminder-schedule-field" : "reminder-schedule-field is-disabled"}>
        {t("One-time date/time")}
        <input
          name="when"
          type="datetime-local"
          disabled={!oneTime}
          required={oneTime}
        />
      </label>
    </>
  );
}

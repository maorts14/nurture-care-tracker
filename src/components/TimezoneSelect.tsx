import { useMemo } from "react";
import { Locale } from "../i18n";
import { timeZoneOptions } from "../timezones";

type TimezoneSelectProps = {
  locale: Locale;
};

export function TimezoneSelect({ locale }: TimezoneSelectProps) {
  const options = useMemo(() => timeZoneOptions(locale), [locale]);
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return (
    <select
      className="timezone-select"
      name="timezone"
      defaultValue={localTimeZone}
      required
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

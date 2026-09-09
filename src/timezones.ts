import { Locale } from "./i18n";

export function timeZoneLabel(timeZone: string, locale: Locale) {
  return (
    new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en", {
      timeZone,
      timeZoneName: "longGeneric",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value ?? timeZone
  );
}

function timeZoneOffset(timeZone: string) {
  return (
    new Intl.DateTimeFormat("en", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT"
  );
}

export function timeZoneOptions(locale: Locale) {
  const collator = new Intl.Collator(locale === "he" ? "he-IL" : "en");
  return Intl.supportedValuesOf("timeZone")
    .map((value) => ({
      value,
      label: `${timeZoneOffset(value)} · ${timeZoneLabel(value, locale)} · ${value}`,
    }))
    .sort((left, right) => collator.compare(left.label, right.label));
}

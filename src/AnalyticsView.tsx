type FieldStat = {
  key: string;
  label: string;
  unit?: string;
  count: number;
  average: number | null;
};
type ActivityStat = {
  activity_id: string;
  count: number;
  average_hours: number | null;
  median_hours: number | null;
  interval_warning: boolean;
  fields: FieldStat[];
};
type Activity = { id: string; name: string; color: string };
import { Menu } from "lucide-react";
import { Locale, translate as tr } from "./i18n";
type Props = {
  child: { id: string; name: string };
  dashboard: {
    activities: Activity[];
    analytics: ActivityStat[];
    gaps: unknown[];
  };
  locale: Locale;
  onBack: () => void;
  onOpenNavigation: () => void;
};
const pretty = (value: number | null, suffix = "") =>
  value === null ? "—" : `${value.toFixed(value < 10 ? 1 : 0)}${suffix}`;

export function AnalyticsView({
  child,
  dashboard,
  locale,
  onBack,
  onOpenNavigation,
}: Props) {
  const t = (text: string) => tr(locale, text);
  const activityById = new Map(
    dashboard.activities.map((activity) => [activity.id, activity]),
  );
  return (
    <section className="analytics-page">
      <header>
        <button
          className="mobile-menu analytics-menu"
          aria-label={t("Open navigation")}
          onClick={onOpenNavigation}
        >
          <Menu size={21} />
        </button>
        <button className="text-button" onClick={onBack}>
          {t("← Timeline")}
        </button>
        <button
          className="text-button report-button"
          onClick={() =>
            window.open(`/api/children/${child.id}/export.report`, "_blank")
          }
        >
          {t("Print / Save as PDF")}
        </button>
        <p className="eyebrow">{t("ACTIVITY DASHBOARD")}</p>
        <h1>
          {child.name}’s {t("care patterns")}
        </h1>
        <p>
          {t("Declared care gaps are excluded from all timing statistics.")}
        </p>
      </header>
      <section className="analytics-cards">
        {dashboard.analytics.map((stat) => {
          const activity = activityById.get(stat.activity_id);
          return (
            <article key={stat.activity_id} className="analytics-card">
              <span
                className="analytics-dot"
                style={{ background: activity?.color }}
              />
              <h2>{activity ? t(activity.name) : t("Activity")}</h2>
              <div className="metric-grid">
                <div>
                  <p>{t("Records")}</p>
                  <strong>{stat.count}</strong>
                </div>
                <div>
                  <p>{t("Median interval")}</p>
                  <strong>{pretty(stat.median_hours, "h")}</strong>
                </div>
                <div>
                  <p>{t("Average interval")}</p>
                  <strong>{pretty(stat.average_hours, "h")}</strong>
                </div>
              </div>
              {stat.interval_warning && (
                <p className="analytics-warning">
                  {t(
                    "Average timing differs materially from the median. Review the pattern before relying on the average.",
                  )}
                </p>
              )}
              {stat.fields.map((field) => (
                <p className="field-stat" key={field.key}>
                  {t(field.label)}:{" "}
                  <strong>
                    {pretty(field.average)}
                    {field.unit ? ` ${field.unit}` : ""}
                  </strong>{" "}
                  {t("from")} {field.count} {t("records")}
                </p>
              ))}
            </article>
          );
        })}
      </section>
      <footer>
        {dashboard.gaps.length}{" "}
        {t(
          dashboard.gaps.length === 1
            ? "declared care gap"
            : "declared care gaps",
        )}{" "}
        {t("excluded from analysis.")}
      </footer>
    </section>
  );
}

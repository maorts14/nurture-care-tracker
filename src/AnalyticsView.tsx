import { useState } from "react";
import { ChevronDown, FileDown, Menu } from "lucide-react";
import { TimelineBackButton } from "./components/TimelineBackButton";
import { Locale, translate as tr } from "./i18n";

type Metrics = {
  count: number;
  portion_count: number;
  total_amount_ml: number;
  average_amount_ml: number | null;
};
type ActivityStat = {
  activity_id: string;
  average: Metrics;
  calendar_day: Metrics;
  last_24_hours: Metrics;
  history: Array<Metrics & { date: string }>;
};
type Activity = {
  id: string;
  name: string;
  kind: "feeding" | "diaper" | "custom";
  color: string;
};
type Props = {
  child: { id: string; name: string };
  dashboard: { activities: Activity[]; analytics: ActivityStat[] };
  locale: Locale;
  onBack: () => void;
  onOpenNavigation: () => void;
};

const pretty = (value: number | null) =>
  value === null ? "—" : value.toFixed(value < 10 ? 1 : 0);

function MetricsGrid({
  metrics,
  feeding,
  t,
  compact = false,
}: {
  metrics: Metrics;
  feeding: boolean;
  t: (text: string) => string;
  compact?: boolean;
}) {
  return (
    <div
      className={`metric-grid ${
        feeding ? "analytics-feeding-metrics" : "analytics-count-metrics"
      } ${compact ? "analytics-compact-metrics" : ""}`}
    >
      <div>
        <p>{t(feeding ? "Feedings" : "Records")}</p>
        <strong>{pretty(metrics.count)}</strong>
      </div>
      {feeding && (
        <>
          <div>
            <p>{t("Portions")}</p>
            <strong>{pretty(metrics.portion_count)}</strong>
          </div>
          <div>
            <p>{t("Total milk")}</p>
            <strong>
              <bdi>{pretty(metrics.total_amount_ml)} ml</bdi>
            </strong>
          </div>
          <div>
            <p>{t("Average per feed")}</p>
            <strong>
              {metrics.average_amount_ml === null ? (
                "—"
              ) : (
                <bdi>{pretty(metrics.average_amount_ml)} ml</bdi>
              )}
            </strong>
          </div>
        </>
      )}
    </div>
  );
}

export function AnalyticsView({
  child,
  dashboard,
  locale,
  onBack,
  onOpenNavigation,
}: Props) {
  const [period, setPeriod] = useState<"calendar_day" | "last_24_hours">(
    "calendar_day",
  );
  const t = (text: string) => tr(locale, text);
  const activityById = new Map(
    dashboard.activities.map((activity) => [activity.id, activity]),
  );
  const periodLabel =
    period === "calendar_day" ? t("Today, from 00:00") : t("Last 24 hours");
  const dateFormatter = new Intl.DateTimeFormat(
    locale === "he" ? "he-IL" : "en-US",
    { weekday: "short", month: "short", day: "numeric" },
  );

  return (
    <section className="analytics-page">
      <header>
        <div className="page-navigation-row">
          <button
            className="mobile-menu analytics-menu"
            aria-label={t("Open navigation")}
            onClick={onOpenNavigation}
          >
            <Menu size={21} />
          </button>
          <TimelineBackButton locale={locale} onClick={onBack} />
        </div>
        <div className="analytics-heading-row">
          <h1>
            {locale === "he" ? (
              <>
                {t("Care patterns for")} <bdi>{child.name}</bdi>
              </>
            ) : (
              <>
                <bdi>{child.name}</bdi>’s {t("care patterns")}
              </>
            )}
          </h1>
          <button
            className="pdf-export-button"
            aria-label={t("Export PDF")}
            title={t("Export PDF")}
            onClick={() =>
              window.open(`/api/children/${child.id}/export.report`, "_blank")
            }
          >
            <FileDown size={17} aria-hidden="true" />
            <span className="pdf-export-label">{t("Export PDF")}</span>
          </button>
        </div>
        <div className="analytics-period-toggle" aria-label={t("Current period")}>
          <button
            className={period === "calendar_day" ? "selected" : ""}
            onClick={() => setPeriod("calendar_day")}
          >
            {t("Today, from 00:00")}
          </button>
          <button
            className={period === "last_24_hours" ? "selected" : ""}
            onClick={() => setPeriod("last_24_hours")}
          >
            {t("Last 24 hours")}
          </button>
        </div>
        <p>{t("Declared care gaps are excluded from all timing statistics.")}</p>
      </header>
      <section className="analytics-cards">
        {dashboard.analytics.map((stat) => {
          const activity = activityById.get(stat.activity_id);
          const feeding = activity?.kind === "feeding";
          const current = stat[period];
          return (
            <article key={stat.activity_id} className="analytics-card">
              <div className="analytics-card-title">
                <span
                  className="analytics-dot"
                  style={{ background: activity?.color }}
                />
                <h2>{activity ? t(activity.name) : t("Activity")}</h2>
              </div>
              <section className="analytics-summary-row">
                <h3>{t("Average")}</h3>
                <MetricsGrid metrics={stat.average} feeding={feeding} t={t} />
              </section>
              <section className="analytics-summary-row analytics-current-row">
                <h3>{periodLabel}</h3>
                <MetricsGrid metrics={current} feeding={feeding} t={t} />
              </section>
              <details className="analytics-history">
                <summary>
                  <span>{t("Previous days")}</span>
                  <ChevronDown size={20} aria-hidden="true" />
                </summary>
                <div className="analytics-history-list">
                  {stat.history.length ? (
                    stat.history.map((day) => (
                      <section className="analytics-history-day" key={day.date}>
                        <time dateTime={day.date}>
                          {dateFormatter.format(
                            new Date(`${day.date}T12:00:00`),
                          )}
                        </time>
                        <MetricsGrid
                          metrics={day}
                          feeding={feeding}
                          t={t}
                          compact
                        />
                      </section>
                    ))
                  ) : (
                    <p>{t("No previous days to show")}</p>
                  )}
                </div>
              </details>
            </article>
          );
        })}
      </section>
    </section>
  );
}

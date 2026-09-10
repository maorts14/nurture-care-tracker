import { useState } from "react";
import { ChevronDown, FileDown, Menu, Settings2, X } from "lucide-react";
import { ModalBackdrop } from "./components/ModalBackdrop";
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
  dashboard: {
    activities: Activity[];
    analytics: ActivityStat[];
    insight_activity_ids: string[] | null;
    first_record_date: string | null;
  };
  locale: Locale;
  onBack: () => void;
  onOpenNavigation: () => void;
  onSaveInsightActivities: (activityIds: string[]) => Promise<void>;
};

const pretty = (value: number | null) =>
  value === null ? "—" : value.toFixed(value < 10 ? 1 : 0);

const dateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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
  onSaveInsightActivities,
}: Props) {
  const [period, setPeriod] = useState<"calendar_day" | "last_24_hours">(
    "calendar_day",
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const defaultActivityIds = dashboard.activities
    .filter((activity) => activity.kind === "feeding" || activity.kind === "diaper")
    .map((activity) => activity.id);
  const selectedActivityIds =
    dashboard.insight_activity_ids ?? defaultActivityIds;
  const [settingsActivityIds, setSettingsActivityIds] = useState<string[]>(
    selectedActivityIds,
  );
  const [exportActivityIds, setExportActivityIds] = useState<string[]>(
    selectedActivityIds,
  );
  const [includeHistory, setIncludeHistory] = useState(false);
  const [historyStart, setHistoryStart] = useState(() => dateInputValue(new Date()));
  const [historyEnd, setHistoryEnd] = useState(() => dateInputValue(new Date()));
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
  const openSettings = () => {
    setSettingsActivityIds(selectedActivityIds);
    setSettingsOpen(true);
  };
  const openExport = () => {
    setExportActivityIds(selectedActivityIds);
    const today = dateInputValue(new Date());
    setHistoryStart(dashboard.first_record_date ?? today);
    setHistoryEnd(today);
    setExportOpen(true);
  };
  const toggleActivity = (activityId: string) => {
    setSettingsActivityIds((ids) =>
      ids.includes(activityId)
        ? ids.filter((id) => id !== activityId)
        : [...ids, activityId],
    );
  };
  const toggleExportActivity = (activityId: string) => {
    setExportActivityIds((ids) =>
      ids.includes(activityId)
        ? ids.filter((id) => id !== activityId)
        : [...ids, activityId],
    );
  };
  const exportReport = () => {
    const query = new URLSearchParams({
      activities: exportActivityIds.join(","),
      period,
      history: String(includeHistory),
      historyStart,
      historyEnd,
      locale,
    });
    const printFrame = document.createElement("iframe");
    printFrame.className = "insights-print-frame";
    printFrame.setAttribute("aria-hidden", "true");
    printFrame.src = `/api/children/${child.id}/export.report?${query}`;
    const removeFrame = () => printFrame.remove();
    printFrame.addEventListener("load", () => {
      const printWindow = printFrame.contentWindow;
      if (!printWindow) {
        removeFrame();
        return;
      }
      printWindow.addEventListener("afterprint", removeFrame, { once: true });
      printWindow.focus();
      printWindow.print();
      window.setTimeout(removeFrame, 60_000);
    });
    document.body.append(printFrame);
    setExportOpen(false);
  };

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
          <div className="analytics-heading-actions">
            <button
              className="insights-settings-button"
              aria-label={t("Insights settings")}
              title={t("Insights settings")}
              onClick={openSettings}
            >
              <Settings2 size={18} aria-hidden="true" />
            </button>
            <button
              className="pdf-export-button"
              aria-label={t("Export PDF")}
              title={t("Export PDF")}
              onClick={openExport}
            >
              <FileDown size={17} aria-hidden="true" />
              <span className="pdf-export-label">{t("Export PDF")}</span>
            </button>
          </div>
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
        {dashboard.analytics
          .filter((stat) => selectedActivityIds.includes(stat.activity_id))
          .map((stat) => {
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
      {settingsOpen && (
        <ModalBackdrop onClose={() => setSettingsOpen(false)}>
          <form
            className="log-modal insights-settings-modal"
            onSubmit={async (event) => {
              event.preventDefault();
              await onSaveInsightActivities(settingsActivityIds);
              setSettingsOpen(false);
            }}
          >
            <div className="insights-settings-heading">
              <h2>{t("Insights settings")}</h2>
              <button
                type="button"
                className="insights-settings-close"
                aria-label={t("Close")}
                onClick={() => setSettingsOpen(false)}
              >
                <X size={22} />
              </button>
            </div>
            <p>{t("Choose activities to show in Insights.")}</p>
            <fieldset className="insights-activity-options">
              {dashboard.activities.map((activity) => (
                <label key={activity.id}>
                  <input
                    type="checkbox"
                    checked={settingsActivityIds.includes(activity.id)}
                    onChange={() => toggleActivity(activity.id)}
                  />
                  <span
                    className="analytics-dot"
                    style={{ background: activity.color }}
                  />
                  {t(activity.name)}
                </label>
              ))}
            </fieldset>
            <div className="modal-actions">
              <button className="submit primary" type="submit">
                {t("Save changes")}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}
      {exportOpen && (
        <ModalBackdrop onClose={() => setExportOpen(false)}>
          <form
            className="log-modal insights-settings-modal insights-export-modal"
            onSubmit={(event) => {
              event.preventDefault();
              exportReport();
            }}
          >
            <div className="insights-settings-heading">
              <h2>{t("Export insights")}</h2>
              <button
                type="button"
                className="insights-settings-close"
                aria-label={t("Close")}
                onClick={() => setExportOpen(false)}
              >
                <X size={22} />
              </button>
            </div>
            <p>{t("Choose the visible sections to include in the PDF.")}</p>
            <fieldset className="insights-activity-options">
              <legend>{t("Sections")}</legend>
              {dashboard.activities
                .filter((activity) => selectedActivityIds.includes(activity.id))
                .map((activity) => (
                  <label key={activity.id}>
                    <input
                      type="checkbox"
                      checked={exportActivityIds.includes(activity.id)}
                      onChange={() => toggleExportActivity(activity.id)}
                    />
                    <span
                      className="analytics-dot"
                      style={{ background: activity.color }}
                    />
                    {t(activity.name)}
                  </label>
                ))}
            </fieldset>
            <label className="insights-history-toggle">
              <input
                type="checkbox"
                checked={includeHistory}
                onChange={(event) => setIncludeHistory(event.target.checked)}
              />
              {t("Include history")}
            </label>
            {includeHistory && (
              <div className="insights-history-range">
                <label>
                  <span>{t("From")}</span>
                  <input
                    type="date"
                    value={historyStart}
                    max={historyEnd}
                    onChange={(event) => setHistoryStart(event.target.value)}
                  />
                </label>
                <label>
                  <span>{t("To")}</span>
                  <input
                    type="date"
                    value={historyEnd}
                    min={historyStart}
                    max={dateInputValue(new Date())}
                    onChange={(event) => setHistoryEnd(event.target.value)}
                  />
                </label>
              </div>
            )}
            <div className="modal-actions">
              <button
                className="submit primary"
                type="submit"
                disabled={!exportActivityIds.length}
              >
                <FileDown size={17} aria-hidden="true" />
                {t("Export PDF")}
              </button>
            </div>
          </form>
        </ModalBackdrop>
      )}
    </section>
  );
}

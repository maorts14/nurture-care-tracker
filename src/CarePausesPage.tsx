import { FormEvent, useState } from "react";
import { Menu, Pencil, Plus, Trash2, X } from "lucide-react";
import { ModalBackdrop } from "./components/ModalBackdrop";
import { InteractiveRow } from "./components/InteractiveRow";
import { TimelineBackButton } from "./components/TimelineBackButton";
import { Locale, translate } from "./i18n";

export type CarePause = {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
  include_in_averages: boolean;
  created_by: string;
};

type PauseDraft = {
  startsAt: string;
  endsAt: string;
  reason: string;
  includeInAverages: boolean;
};

type Props = {
  locale: Locale;
  timezone: string;
  pauses: CarePause[];
  write: boolean;
  onBack: () => void;
  onOpenNavigation: () => void;
  onSave: (pause: CarePause | null, draft: PauseDraft) => Promise<void>;
  onDelete: (pause: CarePause) => Promise<void>;
};

const localDateTime = (value: string | Date = new Date()) => {
  const date = new Date(value);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

export function CarePausesPage({
  locale,
  timezone,
  pauses,
  write,
  onBack,
  onOpenNavigation,
  onSave,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState<CarePause | null | undefined>(undefined);
  const t = (text: string) => translate(locale, text);
  const now = Date.now();
  const active = pauses.filter(
    (pause) => new Date(pause.starts_at).getTime() <= now && new Date(pause.ends_at).getTime() > now,
  );
  const upcoming = pauses.filter((pause) => new Date(pause.starts_at).getTime() > now);
  const past = pauses.filter((pause) => new Date(pause.ends_at).getTime() <= now);
  const formatDateTime = new Intl.DateTimeFormat(locale === "he" ? "he-IL" : "en-US", {
    timeZone: timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const rows = (items: CarePause[]) =>
    items.map((pause) => (
      <InteractiveRow
        key={pause.id}
        className="care-pause-row"
        openLabel={t("Edit care pause")}
        onOpen={write ? () => setEditing(pause) : undefined}
        actions={write ? (
          <>
            <button type="button" aria-label={t("Edit")} title={t("Edit")} onClick={() => setEditing(pause)}>
              <Pencil size={17} />
            </button>
            <button
              type="button"
              className="danger"
              aria-label={t("Delete")}
              title={t("Delete")}
              onClick={async () => {
                if (confirm(t("Delete this care pause?"))) await onDelete(pause);
              }}
            >
              <Trash2 size={17} />
            </button>
          </>
        ) : undefined}
      >
        <div>
          <strong>{pause.reason || t("Care pause")}</strong>
          <p>
            <time dateTime={pause.starts_at}>{formatDateTime.format(new Date(pause.starts_at))}</time>
            <span aria-hidden="true"> — </span>
            <time dateTime={pause.ends_at}>{formatDateTime.format(new Date(pause.ends_at))}</time>
          </p>
          <small>
            {t("Created by")} {pause.created_by} · {pause.include_in_averages ? t("Included in averages") : t("Excluded from averages")}
          </small>
        </div>
      </InteractiveRow>
    ));

  return (
    <section className="care-pauses-page">
      <header>
        <div className="page-navigation-row">
          <button className="mobile-menu caregivers-menu" aria-label={t("Open navigation")} onClick={onOpenNavigation}>
            <Menu size={21} />
          </button>
          <TimelineBackButton locale={locale} onClick={onBack} />
        </div>
        <div className="care-pauses-heading">
          <div>
            <h1>{t("Care pauses")}</h1>
            <p>{t("Pauses exclude timing intervals. By default, every affected day is excluded from Insights averages.")}</p>
          </div>
          {write && (
            <button className="primary" onClick={() => setEditing(null)}>
              <Plus size={18} /> {t("Add care pause")}
            </button>
          )}
        </div>
      </header>
      {!pauses.length ? (
        <p className="care-pause-empty">{t("No care pauses yet.")}</p>
      ) : (
        <div className="care-pause-groups">
          {active.length > 0 && <section><h2>{t("Active now")}</h2>{rows(active)}</section>}
          {upcoming.length > 0 && <section><h2>{t("Upcoming")}</h2>{rows(upcoming)}</section>}
          {past.length > 0 && <section><h2>{t("Past pauses")}</h2>{rows(past)}</section>}
        </div>
      )}
      {editing !== undefined && (
        <ModalBackdrop onClose={() => setEditing(undefined)}>
          <form
            className="log-modal care-pause-modal"
            role="dialog"
            aria-modal="true"
            aria-label={t(editing ? "Edit care pause" : "Add care pause")}
            onSubmit={async (event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              await onSave(editing, {
                startsAt: new Date(String(form.get("start"))).toISOString(),
                endsAt: new Date(String(form.get("end"))).toISOString(),
                reason: String(form.get("reason")),
                includeInAverages: form.get("includeInAverages") === "on",
              });
              setEditing(undefined);
            }}
          >
            <button type="button" className="close" aria-label={t("Close")} onClick={() => setEditing(undefined)}>
              <X size={20} />
            </button>
            <h2>{t(editing ? "Edit care pause" : "Add care pause")}</h2>
            <p className="time-hint">{t("Logs in or across this range do not affect interval analytics.")}</p>
            <label>
              {t("Start")}
              <input name="start" type="datetime-local" required defaultValue={editing ? localDateTime(editing.starts_at) : localDateTime()} />
            </label>
            <label>
              {t("End")}
              <input name="end" type="datetime-local" required defaultValue={editing ? localDateTime(editing.ends_at) : localDateTime()} />
            </label>
            <label>
              {t("Reason")}
              <input name="reason" defaultValue={editing?.reason ?? ""} placeholder={t("Shabbat")} />
            </label>
            <label className="care-pause-average-choice">
              <input name="includeInAverages" type="checkbox" defaultChecked={editing?.include_in_averages ?? false} />
              <span>{t("Include affected days in Insights averages")}</span>
            </label>
            <p className="time-hint">{t("Leave unchecked to exclude every calendar day touched by this pause from long-term averages.")}</p>
            <button className="primary submit">{t(editing ? "Save changes" : "Add care pause")}</button>
          </form>
        </ModalBackdrop>
      )}
    </section>
  );
}

import { ArrowLeft, ArrowRight } from "lucide-react";
import { Locale, translate } from "../i18n";

type TimelineBackButtonProps = {
  locale: Locale;
  onClick: () => void;
};

export function TimelineBackButton({
  locale,
  onClick,
}: TimelineBackButtonProps) {
  const t = (text: string) => translate(locale, text);

  return (
    <button
      className="text-button timeline-back-button"
      aria-label={t("← Timeline")}
      onClick={onClick}
    >
      {locale === "he" ? <ArrowRight size={16} /> : <ArrowLeft size={16} />}
      <span>{t("Timeline")}</span>
    </button>
  );
}

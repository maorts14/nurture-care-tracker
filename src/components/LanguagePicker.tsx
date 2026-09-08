import { X } from "lucide-react";
import { translate } from "../i18n";
import { ModalBackdrop } from "./ModalBackdrop";

type Locale = "en" | "he";

type LanguagePickerProps = {
  locale: Locale;
  onClose: () => void;
  onSelect: (locale: Locale) => void;
};

export function LanguagePicker({
  locale,
  onClose,
  onSelect,
}: LanguagePickerProps) {
  const t = (text: string) => translate(locale, text);
  return (
    <ModalBackdrop onClose={onClose}>
      <section
        className="log-modal language-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="language-title"
      >
        <button
          className="close"
          aria-label={t("Close language picker")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <p className="eyebrow">{t("PREFERENCES")}</p>
        <h2 id="language-title">{t("Language")}</h2>
        <p className="time-hint">
          {t("Choose the language for your family space.")}
        </p>
        <div className="language-options">
          <button
            className={locale === "en" ? "selected" : ""}
            onClick={() => onSelect("en")}
            lang="en"
            dir="ltr"
          >
            English
          </button>
          <button
            className={locale === "he" ? "selected" : ""}
            onClick={() => onSelect("he")}
            lang="he"
            dir="rtl"
          >
            עברית
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}

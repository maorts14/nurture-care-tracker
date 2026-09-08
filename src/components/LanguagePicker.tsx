import { X } from "lucide-react";
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
          aria-label="Close language picker"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <p className="eyebrow">PREFERENCES</p>
        <h2 id="language-title">Language</h2>
        <p className="time-hint">Choose the language for your family space.</p>
        <div className="language-options">
          <button
            className={locale === "en" ? "selected" : ""}
            onClick={() => onSelect("en")}
          >
            English <small>EN</small>
          </button>
          <button
            className={locale === "he" ? "selected" : ""}
            onClick={() => onSelect("he")}
          >
            עברית <small>HE</small>
          </button>
        </div>
      </section>
    </ModalBackdrop>
  );
}

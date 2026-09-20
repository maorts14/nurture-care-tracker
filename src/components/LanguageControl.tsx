import { Languages } from "lucide-react";

type Locale = "en" | "he";

type LanguageControlProps = {
  locale: Locale;
  label: string;
  onClick: () => void;
};

export function LanguageControl({
  locale,
  label,
  onClick,
}: LanguageControlProps) {
  const languageName = locale === "he" ? "עברית" : "English";
  return (
    <button className="language-button" onClick={onClick} aria-label={label}>
      <Languages size={18} aria-hidden="true" />
      <span dir={locale === "he" ? "rtl" : "ltr"}>{languageName}</span>
    </button>
  );
}

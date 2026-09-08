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
    <button className="language-button" onClick={onClick}>
      <Languages size={18} />
      {label}: <span dir={locale === "he" ? "rtl" : "ltr"}>{languageName}</span>
    </button>
  );
}

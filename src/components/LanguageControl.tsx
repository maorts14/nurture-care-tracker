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
  return (
    <button className="language-button" onClick={onClick}>
      <Languages size={18} />
      {label}: {locale.toUpperCase()}
    </button>
  );
}

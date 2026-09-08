import { ReactNode } from "react";

type DetailPageHeaderProps = {
  eyebrow: string;
  title: ReactNode;
  backLabel: string;
  onBack: () => void;
  children?: ReactNode;
};

export function DetailPageHeader({
  eyebrow,
  title,
  backLabel,
  onBack,
  children,
}: DetailPageHeaderProps) {
  return (
    <header>
      <button className="text-button" onClick={onBack}>
        {backLabel}
      </button>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children}
    </header>
  );
}

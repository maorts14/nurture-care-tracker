import { ReactNode } from "react";

type DetailPageHeaderProps = {
  title: ReactNode;
  backLabel: string;
  onBack: () => void;
  children?: ReactNode;
};

export function DetailPageHeader({
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
      <h1>{title}</h1>
      {children}
    </header>
  );
}

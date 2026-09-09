import { ReactNode } from "react";
import { Locale } from "../i18n";
import { TimelineBackButton } from "./TimelineBackButton";

type DetailPageHeaderProps = {
  title: ReactNode;
  locale: Locale;
  onBack: () => void;
  children?: ReactNode;
};

export function DetailPageHeader({
  title,
  locale,
  onBack,
  children,
}: DetailPageHeaderProps) {
  return (
    <header>
      <TimelineBackButton locale={locale} onClick={onBack} />
      <h1>{title}</h1>
      {children}
    </header>
  );
}

import { MouseEvent, ReactNode } from "react";

type InteractiveRowProps = {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
  layout?: "standard" | "custom";
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  onOpen?: () => void;
  openLabel?: string;
};

export function InteractiveRow({
  children,
  actions,
  className = "",
  layout = "standard",
  onClick,
  onOpen,
  openLabel,
}: InteractiveRowProps) {
  const classes = [
    "interactive-row",
    layout === "custom" && "interactive-row-custom",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (layout === "custom") {
    return (
      <article className={classes} onClick={onClick}>
        {children}
      </article>
    );
  }

  return (
    <article className={classes}>
      {onOpen ? (
        <button className="interactive-row-content" type="button" aria-label={openLabel} onClick={onOpen}>
          {children}
        </button>
      ) : (
        <div className="interactive-row-content">{children}</div>
      )}
      {actions && <div className="interactive-row-actions">{actions}</div>}
    </article>
  );
}

type NurtureBrandProps = {
  className?: string;
  onClick?: () => void;
};

export function NurtureBrand({ className = "", onClick }: NurtureBrandProps) {
  const content = (
    <>
      <span className="brand-mark">n</span>
      <span>Nurture</span>
    </>
  );
  if (onClick) {
    return (
      <button
        className={["brand", "brand-link", className].filter(Boolean).join(" ")}
        onClick={onClick}
        aria-label="Go to home"
      >
        {content}
      </button>
    );
  }
  return (
    <div className={["brand", className].filter(Boolean).join(" ")}>
      {content}
    </div>
  );
}

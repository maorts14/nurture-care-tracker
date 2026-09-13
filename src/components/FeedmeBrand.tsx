type FeedmeBrandProps = {
  className?: string;
  onClick?: () => void;
};

export function FeedmeBrand({ className = "", onClick }: FeedmeBrandProps) {
  const content = (
    <>
      <span className="brand-mark">f</span>
      <span>Feedme</span>
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
  return <div className={["brand", className].filter(Boolean).join(" ")}>{content}</div>;
}

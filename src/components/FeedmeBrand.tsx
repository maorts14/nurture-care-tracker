type FeedmeBrandProps = {
  className?: string;
  onClick?: () => void;
};

export function FeedmeBrand({ className = "", onClick }: FeedmeBrandProps) {
  const content = (
    <>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" focusable="false">
          <rect width="32" height="32" rx="7" fill="#f3654b" />
          <path
            fill="#fff"
            d="M13.25 5.25h5.5v4.6c0 .85.52 1.63 1.32 1.95a4.8 4.8 0 0 1 3.05 4.47v7.48A4.75 4.75 0 0 1 18.38 28h-4.76a4.75 4.75 0 0 1-4.74-4.75v-7.48a4.8 4.8 0 0 1 3.05-4.47 2.1 2.1 0 0 0 1.32-1.95v-4.1Z"
          />
          <path fill="#fff" d="M11 11h10v2H11z" />
          <path fill="#f3654b" d="M13 16h6v1.5h-6zm0 3.25h6v1.5h-6zm0 3.25h6V24h-6z" />
        </svg>
      </span>
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

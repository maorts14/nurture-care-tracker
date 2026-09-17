import { LogOut, ShieldCheck } from "lucide-react";

type SidebarAccountProps = {
  displayName: string;
  detail?: string;
  onPrivacyData?: () => void;
  privacyDataLabel?: string;
  onSignOut: () => void;
  signOutLabel: string;
};

export function SidebarAccount({
  displayName,
  detail,
  onPrivacyData,
  privacyDataLabel,
  onSignOut,
  signOutLabel,
}: SidebarAccountProps) {
  return (
    <div className="user">
      <span className="avatar you">{displayName[0]}</span>
      <span>
        <strong>{displayName}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {onPrivacyData && privacyDataLabel && (
        <button
          className="sidebar-account-action"
          onClick={onPrivacyData}
          aria-label={privacyDataLabel}
        >
          <ShieldCheck size={16} />
          <span>{privacyDataLabel}</span>
        </button>
      )}
      <button
        className="sidebar-sign-out"
        onClick={onSignOut}
        aria-label={signOutLabel}
      >
        <LogOut size={16} />
        <span>{signOutLabel}</span>
      </button>
    </div>
  );
}

import { LogOut } from "lucide-react";

type SidebarAccountProps = {
  displayName: string;
  detail?: string;
  onSignOut: () => void;
  signOutLabel: string;
};

export function SidebarAccount({
  displayName,
  detail,
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

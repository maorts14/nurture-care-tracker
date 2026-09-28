import { ChevronDown, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type SidebarAccountProps = {
  displayName: string;
  onSettings?: () => void;
  settingsLabel?: string;
  onSignOut: () => void;
  signOutLabel: string;
};

export function SidebarAccount({
  displayName,
  onSettings,
  settingsLabel,
  onSignOut,
  signOutLabel,
}: SidebarAccountProps) {
  const [isOpen, setIsOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  const closeMenu = () => setIsOpen(false);

  useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) closeMenu();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
  }, [isOpen]);

  return (
    <div ref={accountRef} className="user sidebar-account">
      <button
        className="sidebar-account-trigger"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="avatar you" aria-hidden="true">{displayName[0]}</span>
        <strong>{displayName}</strong>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="sidebar-account-menu">
          {onSettings && settingsLabel && (
            <button
              type="button"
              onClick={() => {
                closeMenu();
                onSettings();
              }}
            >
              <Settings size={16} />
              {settingsLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              closeMenu();
              onSignOut();
            }}
          >
            <LogOut size={16} />
            {signOutLabel}
          </button>
        </div>
      )}
    </div>
  );
}

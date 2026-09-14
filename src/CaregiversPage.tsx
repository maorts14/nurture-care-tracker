import { Menu, UserMinus } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { TimelineBackButton } from "./components/TimelineBackButton";
import { Locale, translate } from "./i18n";

type ChildMember = {
  id: string;
  display_name: string;
  email: string;
  role: "owner" | "care_manager" | "caregiver" | "viewer";
};

type Props = {
  locale: Locale;
  members: ChildMember[];
  owner: boolean;
  onBack: () => void;
  onOpenNavigation: () => void;
  onChangeRole: (
    member: ChildMember,
    role: "care_manager" | "caregiver" | "viewer",
  ) => void;
  onRemove: (member: ChildMember) => void;
};

export function CaregiversPage({
  locale,
  members,
  owner,
  onBack,
  onOpenNavigation,
  onChangeRole,
  onRemove,
}: Props) {
  const t = (text: string) => translate(locale, text);
  const memberRows = useRef(new Map<string, HTMLElement>());
  const previousRowPositions = useRef(new Map<string, DOMRect>());

  useLayoutEffect(() => {
    const nextRowPositions = new Map<string, DOMRect>();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    for (const member of members) {
      const row = memberRows.current.get(member.id);
      if (!row) continue;

      const nextPosition = row.getBoundingClientRect();
      const previousPosition = previousRowPositions.current.get(member.id);
      nextRowPositions.set(member.id, nextPosition);

      if (!previousPosition || reducedMotion) continue;

      const offset = previousPosition.top - nextPosition.top;
      if (offset) {
        row.animate(
          [
            { transform: `translateY(${offset}px)` },
            { transform: "translateY(0)" },
          ],
          { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
        );
      }
    }

    previousRowPositions.current = nextRowPositions;
  }, [members]);

  return (
    <section className="caregivers-page">
      <header>
        <div className="page-navigation-row">
          <button
            className="mobile-menu caregivers-menu"
            aria-label={t("Open navigation")}
            onClick={onOpenNavigation}
          >
            <Menu size={21} />
          </button>
          <TimelineBackButton locale={locale} onClick={onBack} />
        </div>
        <h1>{t("Caregivers")}</h1>
        <p>{t("People with access to this child's care space.")}</p>
      </header>
      {!owner && <p className="member-notice">{t("Only the owner can manage caregiver access.")}</p>}
      <section className="member-list">
        {members.map((member) => (
          <article
            key={member.id}
            ref={(row) => {
              if (row) memberRows.current.set(member.id, row);
              else memberRows.current.delete(member.id);
            }}
          >
            <span className="avatar you">{member.display_name[0]}</span>
            <div className="member-details">
              <strong>{member.display_name}</strong>
              <small>
                <bdi>{member.email}</bdi> · {t(member.role === "care_manager" ? "Care manager" : member.role)}
              </small>
            </div>
            {owner && member.role !== "owner" && (
              <div className="member-actions">
                <label>
                  <span className="sr-only">{t("Role")}</span>
                  <select
                    value={member.role}
                    onChange={(event) =>
                      onChangeRole(
                        member,
                        event.target.value as "care_manager" | "caregiver" | "viewer",
                      )
                    }
                  >
                    <option value="care_manager">{t("Care manager")}</option>
                    <option value="caregiver">{t("Caregiver")}</option>
                    <option value="viewer">{t("Viewer")}</option>
                  </select>
                </label>
                <button
                  className="member-remove"
                  title={t("Remove access")}
                  aria-label={t("Remove access")}
                  onClick={() => onRemove(member)}
                >
                  <UserMinus size={17} />
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </section>
  );
}

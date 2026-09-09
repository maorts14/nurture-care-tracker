import { Menu, UserMinus } from "lucide-react";
import { TimelineBackButton } from "./components/TimelineBackButton";
import { Locale, translate } from "./i18n";

type ChildMember = {
  id: string;
  display_name: string;
  email: string;
  role: "owner" | "caregiver" | "viewer";
};

type Props = {
  locale: Locale;
  members: ChildMember[];
  owner: boolean;
  onBack: () => void;
  onOpenNavigation: () => void;
  onChangeRole: (member: ChildMember, role: "caregiver" | "viewer") => void;
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
          <article key={member.id}>
            <span className="avatar you">{member.display_name[0]}</span>
            <div className="member-details">
              <strong>{member.display_name}</strong>
              <small>
                <bdi>{member.email}</bdi> · {t(member.role)}
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
                        event.target.value as "caregiver" | "viewer",
                      )
                    }
                  >
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

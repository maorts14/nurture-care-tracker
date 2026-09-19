import { FormEvent } from "react";
import { X } from "lucide-react";
import { Locale, translate } from "../i18n";
import { ModalBackdrop } from "./ModalBackdrop";
import { TimezoneSelect } from "./TimezoneSelect";

type CreateChildModalProps = {
  error: string;
  locale: Locale;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function CreateChildModal({
  error,
  locale,
  onClose,
  onSubmit,
}: CreateChildModalProps) {
  const t = (text: string) => translate(locale, text);
  return (
    <ModalBackdrop onClose={onClose}>
      <form className="log-modal create-child-modal" role="dialog" aria-modal="true" aria-labelledby="create-child-title" onSubmit={onSubmit}>
        <button type="button" className="close" aria-label={t("Close")} onClick={onClose}>
          <X size={20} />
        </button>
        <p className="eyebrow">{t("NEW CHILD PROFILE")}</p>
        <h2 id="create-child-title">{t("Add a child")}</h2>
        <p className="time-hint">
          {t("You can add more children and invite caregivers later.")}
        </p>
        <label>
          {t("Child’s name")}
          <input name="name" autoFocus required />
        </label>
        <label>
          {t("Timezone")}
          <TimezoneSelect locale={locale} />
        </label>
        <label>
          {t("Birth date")} <small>{t("(optional)")}</small>
          <input name="birthDate" type="date" />
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary submit">{t("Create child")}</button>
      </form>
    </ModalBackdrop>
  );
}

import { FormEvent } from "react";
import { X } from "lucide-react";
import { ModalBackdrop } from "./ModalBackdrop";

type CreateChildModalProps = {
  error: string;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function CreateChildModal({
  error,
  onClose,
  onSubmit,
}: CreateChildModalProps) {
  return (
    <ModalBackdrop onClose={onClose}>
      <form className="log-modal create-child-modal" onSubmit={onSubmit}>
        <button type="button" className="close" onClick={onClose}>
          <X size={20} />
        </button>
        <p className="eyebrow">NEW CHILD PROFILE</p>
        <h2>Add a child</h2>
        <p className="time-hint">
          You can add more children and invite caregivers later.
        </p>
        <label>
          Child’s name
          <input name="name" autoFocus required />
        </label>
        <label>
          Timezone
          <input
            name="timezone"
            defaultValue={Intl.DateTimeFormat().resolvedOptions().timeZone}
            required
          />
        </label>
        <label>
          Birth date <small>(optional)</small>
          <input name="birthDate" type="date" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary submit">Create child</button>
      </form>
    </ModalBackdrop>
  );
}

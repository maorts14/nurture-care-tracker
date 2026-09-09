import { FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { DetailPageHeader } from "./components/DetailPageHeader";
import { Locale, translate } from "./i18n";

type Note = {
  id: string;
  body: string;
  visibility: "private" | "shared";
  created_by: string;
  created_by_name: string;
};
type Props = {
  locale: Locale;
  notes: Note[];
  userId: string;
  write: boolean;
  onClose: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (note: Note) => void;
  onDelete: (note: Note) => void;
};

export function NotesPage({
  locale,
  notes,
  userId,
  write,
  onClose,
  onCreate,
  onEdit,
  onDelete,
}: Props) {
  const t = (text: string) => translate(locale, text);
  return (
    <main className="detail-page">
      <DetailPageHeader
        title={t("Notes")}
        backLabel={t("← Timeline")}
        onBack={onClose}
      />
      {write && (
        <form className="detail-form" onSubmit={onCreate}>
          <label>
            {t("New note")}
            <textarea name="body" required />
          </label>
          <label>
            {t("Visibility")}
            <select name="visibility">
              <option value="shared">{t("Shared with caregivers")}</option>
              <option value="private">{t("Only me")}</option>
            </select>
          </label>
          <button className="primary">{t("Save note")}</button>
        </form>
      )}
      <section className="detail-list">
        {notes.map((note) => (
          <article key={note.id}>
            <div>
              <strong>{note.created_by_name}</strong>
              <span>{t(note.visibility)}</span>
            </div>
            <p>{note.body}</p>
            {note.created_by === userId && (
              <div className="inline-actions">
                <button onClick={() => onEdit(note)}>
                  <Pencil size={14} />
                  {t("Edit")}
                </button>
                <button className="danger" onClick={() => onDelete(note)}>
                  <Trash2 size={14} />
                  {t("Delete")}
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </main>
  );
}

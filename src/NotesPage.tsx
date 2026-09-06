import { FormEvent } from "react";
import { Pencil, Trash2, X } from "lucide-react";

type Note = { id: string; body: string; visibility: "private" | "shared"; created_by: string; created_by_name: string };
type Props = { notes: Note[]; userId: string; write: boolean; onClose: () => void; onCreate: (event: FormEvent<HTMLFormElement>) => void; onEdit: (note: Note) => void; onDelete: (note: Note) => void };

export function NotesPage({ notes, userId, write, onClose, onCreate, onEdit, onDelete }: Props) {
  return <main className="detail-page"><header><button className="text-button" onClick={onClose}>← Timeline</button><p className="eyebrow">SHARED CHILD SPACE</p><h1>Notes</h1></header>{write && <form className="detail-form" onSubmit={onCreate}><label>New note<textarea name="body" required /></label><label>Visibility<select name="visibility"><option value="shared">Shared with caregivers</option><option value="private">Only me</option></select></label><button className="primary">Save note</button></form>}<section className="detail-list">{notes.map((note) => <article key={note.id}><div><strong>{note.created_by_name}</strong><span>{note.visibility}</span></div><p>{note.body}</p>{note.created_by === userId && <div className="inline-actions"><button onClick={() => onEdit(note)}><Pencil size={14} />Edit</button><button className="danger" onClick={() => onDelete(note)}><Trash2 size={14} />Delete</button></div>}</article>)}</section></main>;
}

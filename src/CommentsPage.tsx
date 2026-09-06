import { FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";

type Comment = { id: string; body: string; created_by: string; created_by_name: string };
type Props = { item: { activity_name: string; event_time: string }; comments: Comment[]; comment: string; userId: string; write: boolean; canDeleteLog: boolean; onClose: () => void; onChange: (value: string) => void; onCreate: (event: FormEvent) => void; onEdit: (comment: Comment) => void; onDeleteComment: (comment: Comment) => void; onDeleteLog: () => void };

export function CommentsPage({ item, comments, comment, userId, write, canDeleteLog, onClose, onChange, onCreate, onEdit, onDeleteComment, onDeleteLog }: Props) {
  return <main className="detail-page"><header><button className="text-button" onClick={onClose}>← Timeline</button><p className="eyebrow">CARE RECORD</p><h1>{item.activity_name}</h1></header><section className="detail-list">{comments.map((entry) => <article key={entry.id}><strong>{entry.created_by_name}</strong><p>{entry.body}</p>{entry.created_by === userId && <div className="inline-actions"><button onClick={() => onEdit(entry)}><Pencil size={14} />Edit</button><button className="danger" onClick={() => onDeleteComment(entry)}><Trash2 size={14} />Delete</button></div>}</article>)}</section>{write && <form className="detail-form" onSubmit={onCreate}><label>Comment<textarea value={comment} onChange={(event) => onChange(event.target.value)} required /></label><button className="primary">Save comment</button></form>}{canDeleteLog && <button className="text-button danger" onClick={onDeleteLog}><Trash2 size={14} />Delete this care record</button>}</main>;
}

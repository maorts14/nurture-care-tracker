import { ArrowLeft, Download, LockKeyhole, ShieldCheck, Trash2, X } from "lucide-react";
import { useState } from "react";
import { FeedmeBrand } from "./components/FeedmeBrand";
import { translate } from "./i18n";

type AccountDataPageProps = {
  locale: "en" | "he";
  email: string;
  onBack: () => void;
  onDownload: () => Promise<void>;
  onDelete: (emailConfirmation: string) => Promise<void>;
};

export function AccountDataPage({
  locale,
  email,
  onBack,
  onDownload,
  onDelete,
}: AccountDataPageProps) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [emailConfirmation, setEmailConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const t = (text: string) => translate(locale, text);

  async function download() {
    setDownloading(true);
    setError("");
    try {
      await onDownload();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setDownloading(false);
    }
  }
  async function deleteAccount() {
    setDeleting(true);
    setDeleteError("");
    try {
      await onDelete(emailConfirmation);
    } catch (cause) {
      setDeleteError((cause as Error).message);
      setDeleting(false);
    }
  }

  return (
    <main className="account-data-page">
      <header className="account-data-header">
        <FeedmeBrand onClick={onBack} />
        <button className="text-button account-back" onClick={onBack}>
          <ArrowLeft size={17} />
          {t("Back to children")}
        </button>
      </header>
      <section className="account-data-hero">
        <p className="eyebrow">{t("PRIVACY & DATA")}</p>
        <h1>{t("Your account, your data.")}</h1>
        <p>
          {t("Manage the information tied directly to your Feedme account.")}
        </p>
      </section>
      <section className="account-data-grid">
        <article className="account-data-card">
          <Download size={22} />
          <p className="eyebrow">{t("DATA EXPORT")}</p>
          <h2>{t("Download your account data")}</h2>
          <p>
            {t("Create a JSON copy of your profile, care-space memberships, and care items you created. It does not include other caregivers’ profiles or private data.")}
          </p>
          {error && <p className="form-error">{error}</p>}
          <button className="primary" onClick={download} disabled={downloading}>
            <Download size={17} />
            {downloading ? t("Preparing export…") : t("Download data")}
          </button>
        </article>
        <article className="account-data-card account-data-next">
          <Trash2 size={22} />
          <p className="eyebrow">{t("ACCOUNT DELETION")}</p>
          <h2>{t("Delete your account")}</h2>
          <p>
            {t("This removes your Feedme profile. Shared care records stay available without your identity; your notes, comments, and invitations are removed. A sole-owner child space is deleted, while a shared space transfers to its earliest caregiver.")}
          </p>
          <button className="text-button danger-text" onClick={() => setDeleteOpen(true)}>
            {t("Delete account")}
          </button>
        </article>
        <article className="account-data-card account-data-note">
          <LockKeyhole size={22} />
          <h2>{t("Need help with a privacy request?")}</h2>
          <p>{t("The public Privacy page explains the controls that will be available at launch.")}</p>
          <button className="text-button" onClick={() => window.location.assign("/privacy")}>
            {t("Read privacy information")}
          </button>
        </article>
      </section>
      {deleteOpen && (
        <div className="account-delete-backdrop" role="presentation">
          <section className="account-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
            <button className="close" aria-label={t("Close")} onClick={() => setDeleteOpen(false)}><X size={20} /></button>
            <Trash2 size={22} />
            <p className="eyebrow">{t("PERMANENT ACTION")}</p>
            <h2 id="delete-account-title">{t("Delete your Feedme account?")}</h2>
            <p>{t("This cannot be undone. Enter your account email to confirm.")}</p>
            <label>
              {t("Account email")}
              <input type="email" value={emailConfirmation} onChange={(event) => setEmailConfirmation(event.target.value)} placeholder={email} autoFocus />
            </label>
            {deleteError && <p className="form-error">{deleteError}</p>}
            <div className="account-delete-actions">
              <button className="text-button" onClick={() => setDeleteOpen(false)}>{t("Cancel")}</button>
              <button className="danger-primary" onClick={deleteAccount} disabled={deleting || emailConfirmation !== email}>{deleting ? t("Deleting account…") : t("Permanently delete account")}</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

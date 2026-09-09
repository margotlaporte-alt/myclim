import { useMemo, useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { FileUpload } from "./file-upload";
import { useLanguage } from "./language-context";
import { getDisplayName } from "./utils";
import { db } from "../services/firebase";

function getInvoiceDocumentUrl(document) {
  if (document?.fileUrl) return document.fileUrl;
  if (/^https?:\/\//i.test(String(document?.reference || "").trim())) return document.reference;
  return "";
}

function formatInvoiceStatusLabel(invoice, t) {
  if (String(invoice?.invoiceStatus || "").trim() === "linked" && invoice?.linkedBudgetRowLabel) {
    const label = t ? t("invoiceClassified") : "Classée";
    return `${label} · ${invoice.linkedBudgetRowLabel}`;
  }

  return t ? t("invoiceToClassify") : "À classer";
}

function buildBudgetExpenseTargetOptions(sections = [], editionId = "") {
  return sections.flatMap(({ sectionName, rows }) =>
    rows.map((row) => ({
      value: row.id,
      rowId: row.id,
      rowLabel: `#${row.rowNumber} ${row.label}`.trim(),
      sectionName,
      collectionKey: "expenses",
      editionId,
    })),
  );
}

function InvoiceUploadForm({
  editionId,
  currentUser,
  userProfile,
  assignedTeams = [],
  expenseTargets = [],
  defaultTargetId = "",
  onSaved,
}) {
  const { t } = useLanguage();
  const [formState, setFormState] = useState({
    title: "",
    note: "",
    fileUrl: "",
    fileName: "",
    filePath: "",
    mimeType: "",
    selectedTargetId: defaultTargetId,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState("");

  const selectedTarget = useMemo(
    () => expenseTargets.find((target) => target.value === formState.selectedTargetId) ?? null,
    [expenseTargets, formState.selectedTargetId],
  );

  function handleChange(event) {
    const { name, value } = event.target;
    setFormState((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!currentUser?.uid) return;
    if (!formState.fileUrl) {
      setStatus(t("invoiceAddFileFirst"));
      return;
    }

    setIsSubmitting(true);
    setStatus(t("invoiceSaving"));

    try {
      await addDoc(collection(db, "documents"), {
        documentType: "invoice",
        title: String(formState.title || "").trim() || formState.fileName || t("invoiceDefaultTitle"),
        reference: formState.fileUrl,
        fileName: formState.fileName,
        fileUrl: formState.fileUrl,
        filePath: formState.filePath,
        mimeType: formState.mimeType,
        scope: "private",
        teams: Array.isArray(assignedTeams) ? assignedTeams.filter(Boolean) : [],
        visibility: "Facture privée",
        editionId: String(editionId || "").trim(),
        uploadedByUid: String(currentUser.uid || "").trim(),
        uploadedByName: getDisplayName(userProfile, currentUser.email),
        ownerUid: String(currentUser.uid || "").trim(),
        invoiceNote: String(formState.note || "").trim(),
        invoiceStatus: selectedTarget ? "linked" : "unclassified",
        linkedBudgetEditionId: selectedTarget?.editionId || "",
        linkedBudgetCollectionKey: selectedTarget?.collectionKey || "",
        linkedBudgetRowId: selectedTarget?.rowId || "",
        linkedBudgetRowLabel: selectedTarget?.rowLabel || "",
        linkedBudgetSectionName: selectedTarget?.sectionName || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setFormState({
        title: "",
        note: "",
        fileUrl: "",
        fileName: "",
        filePath: "",
        mimeType: "",
        selectedTargetId: defaultTargetId,
      });
      setStatus(selectedTarget ? t("invoiceSavedLinked") : t("invoiceSavedUnlinked"));
      onSaved?.();
    } catch (error) {
      console.error("Unable to save invoice document", error);
      setStatus(t("invoiceSaveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="section-stack invoice-upload-form" onSubmit={handleSubmit}>
      <div className="field">
        <span>{t("invoiceTitleLabel")}</span>
        <input
          name="title"
          placeholder={t("invoiceTitlePlaceholder")}
          value={formState.title}
          onChange={handleChange}
        />
      </div>

      <div className="field">
        <span>{t("invoiceFileLabel")}</span>
        <FileUpload
          value={formState.fileUrl}
          onChange={(url) => setFormState((current) => ({ ...current, fileUrl: url }))}
          onUploadComplete={(file) =>
            setFormState((current) => ({
              ...current,
              fileUrl: file.url,
              fileName: file.fileName,
              filePath: file.filePath,
              mimeType: file.mimeType,
              title: current.title || file.fileName,
            }))
          }
          accept=".pdf,image/*"
          storagePath={`budget-invoices/${String(editionId || "active").trim() || "active"}`}
          label={t("invoiceUploadLabel")}
          helperText={t("invoiceUploadHelper")}
        />
      </div>

      {expenseTargets.length ? (
        <div className="field">
          <span>{t("invoiceExpenseLineLabel")}</span>
          <select name="selectedTargetId" value={formState.selectedTargetId} onChange={handleChange}>
            <option value="">{t("invoiceClassifyLater")}</option>
            {expenseTargets.map((target) => (
              <option key={target.value} value={target.value}>
                {target.rowLabel} · {target.sectionName}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="field">
        <span>{t("invoiceNoteLabel")}</span>
        <textarea
          name="note"
          placeholder={t("invoiceNotePlaceholder")}
          rows={3}
          value={formState.note}
          onChange={handleChange}
        />
      </div>

      <div className="table-actions table-actions--inline invoice-upload-form__actions">
        <button className="button button--primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t("invoiceSubmitting") : t("invoiceSubmitButton")}
        </button>
      </div>

      {status ? <p className="panel-note">{status}</p> : null}
    </form>
  );
}

function InvoiceInlineList({ invoices = [], canManage = false, onDetach }) {
  const { t } = useLanguage();

  if (!invoices.length) {
    return <span className="budget-invoice-list__empty">—</span>;
  }

  return (
    <div className="budget-invoice-list">
      {invoices.map((invoice) => {
        const consultationUrl = getInvoiceDocumentUrl(invoice);

        return (
          <div className="budget-invoice-pill" key={invoice.id}>
            <button
              className="budget-invoice-pill__link"
              type="button"
              onClick={() => {
                if (!consultationUrl) return;
                window.open(consultationUrl, "_blank", "noopener,noreferrer");
              }}
            >
              {invoice.fileName || invoice.title || t("invoiceDefaultTitle")}
            </button>
            {canManage ? (
              <button
                className="budget-invoice-pill__detach"
                type="button"
                onClick={() => onDetach?.(invoice)}
                aria-label={t("invoiceDetachAria").replace("{name}", invoice.fileName || invoice.title || t("invoiceDefaultTitle"))}
                title={t("invoiceDetachTitle")}
              >
                ×
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export {
  buildBudgetExpenseTargetOptions,
  formatInvoiceStatusLabel,
  getInvoiceDocumentUrl,
  InvoiceInlineList,
  InvoiceUploadForm,
};

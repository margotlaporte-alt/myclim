import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../services/firebase";

function isExternalDocumentLink(reference) {
  return /^https?:\/\//i.test(String(reference || "").trim());
}

function getDocumentReferenceUrl(document) {
  if (document?.fileUrl) return document.fileUrl;
  if (isExternalDocumentLink(document?.reference)) return document.reference;
  return "";
}

function mapStoredDocument(snapshot) {
  const data = snapshot.data();
  const createdAt = data.createdAt?.toDate?.() ?? null;
  const scope = data.scope === "teams" ? "teams" : data.scope === "private" ? "private" : "global";

  return {
    id: snapshot.id,
    documentType: data.documentType === "invoice" ? "invoice" : "document",
    title: data.title || "Document",
    reference: data.reference || "",
    fileName: data.fileName || "",
    fileUrl: data.fileUrl || "",
    filePath: data.filePath || "",
    mimeType: data.mimeType || "",
    scope,
    teams: Array.isArray(data.teams) ? data.teams : [],
    visibility:
      data.visibility ||
      (scope === "global" ? "Tous les utilisateurs concernés" : scope === "teams" ? "Équipes ciblées" : "Privé"),
    createdAtLabel: createdAt ? createdAt.toLocaleDateString("fr-LU") : "",
    createdAtMs: createdAt ? createdAt.getTime() : 0,
    createdAt,
    editionId: String(data.editionId || "").trim(),
    ownerUid: String(data.ownerUid || "").trim(),
    uploadedByUid: String(data.uploadedByUid || "").trim(),
    uploadedByName: String(data.uploadedByName || "").trim(),
    invoiceNote: String(data.invoiceNote || "").trim(),
    invoiceStatus: String(data.invoiceStatus || "").trim() || "unclassified",
    linkedBudgetEditionId: String(data.linkedBudgetEditionId || "").trim(),
    linkedBudgetCollectionKey: String(data.linkedBudgetCollectionKey || "").trim(),
    linkedBudgetRowId: String(data.linkedBudgetRowId || "").trim(),
    linkedBudgetRowLabel: String(data.linkedBudgetRowLabel || "").trim(),
    linkedBudgetSectionName: String(data.linkedBudgetSectionName || "").trim(),
    resolvedUrl: getDocumentReferenceUrl({
      fileUrl: data.fileUrl || "",
      reference: data.reference || "",
    }),
  };
}

function useDocumentsCollection(enabled = true) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return undefined;

    const unsubscribe = onSnapshot(
      collection(db, "documents"),
      (snapshot) => {
        setDocuments(snapshot.docs.map(mapStoredDocument));
        setLoading(false);
        setError("");
      },
      () => {
        setDocuments([]);
        setLoading(false);
        setError("Impossible de récupérer les documents.");
      },
    );

    return unsubscribe;
  }, [enabled]);

  return enabled ? { documents, loading, error } : { documents: [], loading: false, error: "" };
}

export { getDocumentReferenceUrl, isExternalDocumentLink, mapStoredDocument, useDocumentsCollection };

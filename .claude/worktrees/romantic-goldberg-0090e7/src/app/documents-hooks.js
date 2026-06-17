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
  const scope = data.scope === "teams" ? "teams" : "global";

  return {
    id: snapshot.id,
    title: data.title || "Document",
    reference: data.reference || "",
    fileName: data.fileName || "",
    fileUrl: data.fileUrl || "",
    filePath: data.filePath || "",
    scope,
    teams: Array.isArray(data.teams) ? data.teams : [],
    visibility:
      data.visibility || (scope === "global" ? "Tous les utilisateurs concernés" : "Équipes ciblées"),
    createdAtLabel: createdAt ? createdAt.toLocaleDateString("fr-LU") : "",
    createdAtMs: createdAt ? createdAt.getTime() : 0,
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

export { mapStoredDocument, useDocumentsCollection };

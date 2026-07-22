import { useState, useRef } from "react";
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../services/firebase";

/**
 * FileUpload — drag-and-drop or click-to-select file uploader backed by Firebase Storage.
 *
 * Props:
 *   value        string   current URL (shows "existing file" state)
 *   onChange     fn(url)  called with the public download URL after upload completes
 *   accept       string   MIME type filter, e.g. "application/pdf"
 *   storagePath  string   Firebase Storage folder, e.g. "press-releases"
 *   label        string   field label
 */
export function FileUpload({
  value,
  onChange,
  onUploadComplete,
  accept = "application/pdf",
  storagePath = "uploads",
  label = "File",
  helperText = "PDF files only · Max 20 MB",
}) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const startupTimerRef = useRef(null);
  const stalledUploadTimerRef = useRef(null);
  const didForceAbortRef = useRef(false);
  const hasTransferredBytesRef = useRef(false);
  const activeAttemptIdRef = useRef(0);

  const labelStyle = {
    fontSize: "0.78rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#546770",
    display: "block",
    marginBottom: 6,
  };

  function clearStartupTimer() {
    if (startupTimerRef.current) {
      window.clearTimeout(startupTimerRef.current);
      startupTimerRef.current = null;
    }
  }

  function clearStalledUploadTimer() {
    if (stalledUploadTimerRef.current) {
      window.clearTimeout(stalledUploadTimerRef.current);
      stalledUploadTimerRef.current = null;
    }
  }

  function isAttemptActive(attemptId) {
    return activeAttemptIdRef.current === attemptId;
  }

  function invalidateAttempt(attemptId) {
    if (activeAttemptIdRef.current === attemptId) {
      activeAttemptIdRef.current += 1;
    }
  }

  function armStalledUploadTimer(task) {
    clearStalledUploadTimer();
    stalledUploadTimerRef.current = window.setTimeout(() => {
      didForceAbortRef.current = true;
      task.cancel();
    }, 15000);
  }

  function formatUploadError(err) {
    const code = err?.code || "";

    if (code === "storage/unauthorized" || code === "storage/unauthenticated") {
      return "Upload impossible pour le moment. Vous semblez non authentifié(e) sur Firebase Storage.";
    }

    if (code === "storage/canceled") {
      if (didForceAbortRef.current) {
        return "L'envoi est resté bloqué au démarrage. Vérifiez la connexion ou Firebase Storage, puis réessayez.";
      }
      return "Envoi annulé.";
    }

    if (code === "storage/bucket-not-found" || code === "storage/project-not-found") {
      return "Le stockage Firebase n'est pas disponible pour ce projet.";
    }

    if (code === "storage/retry-limit-exceeded") {
      return "Le stockage ne répond pas. Ce n'est généralement pas lié au local, mais à Firebase ou à la connexion.";
    }

    if (code === "storage/direct-upload-timeout") {
      return "Le second mode d'envoi ne répond pas non plus. Vérifiez Firebase Storage ou la connexion, puis réessayez.";
    }

    return err?.message || "Upload impossible pour le moment.";
  }

  function buildUploadPayload(file, storageRef, url) {
    return {
      url,
      fileName: file.name,
      filePath: storageRef.fullPath,
      mimeType: file.type || "",
    };
  }

  async function completeUpload(file, storageRef, attemptId) {
    if (!isAttemptActive(attemptId)) return;
    const url = await getDownloadURL(storageRef);
    if (!isAttemptActive(attemptId)) return;
    const payload = buildUploadPayload(file, storageRef, url);
    onChange(url);
    onUploadComplete?.(payload);
    setStatusMessage("");
    setProgress(null);
  }

  async function tryDirectUpload(file, storageRef, attemptId) {
    if (!isAttemptActive(attemptId)) return;
    setStatusMessage("Reprise automatique de l'envoi…");
    setProgress(12);
    await Promise.race([
      uploadBytes(storageRef, file, file.type ? { contentType: file.type } : undefined),
      new Promise((_, reject) => {
        window.setTimeout(() => {
          reject(Object.assign(new Error("L'envoi direct reste bloqué."), { code: "storage/direct-upload-timeout" }));
        }, 15000);
      }),
    ]);
    if (!isAttemptActive(attemptId)) return;
    setProgress(100);
    await completeUpload(file, storageRef, attemptId);
  }

  async function uploadFile(file) {
    if (!file) return;
    const attemptId = activeAttemptIdRef.current + 1;
    activeAttemptIdRef.current = attemptId;
    clearStartupTimer();
    clearStalledUploadTimer();
    didForceAbortRef.current = false;
    hasTransferredBytesRef.current = false;
    setError("");
    setProgress(0);
    setStatusMessage("Connexion à l'espace de stockage…");

    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storageRef = ref(storage, `${storagePath}/${safeName}`);
    const task = uploadBytesResumable(storageRef, file);

    startupTimerRef.current = window.setTimeout(() => {
      setStatusMessage("Connexion lente à Firebase Storage. En local, cela fonctionne normalement aussi.");
    }, 4000);

    armStalledUploadTimer(task);

    task.on(
      "state_changed",
      (snap) => {
        if (!isAttemptActive(attemptId)) return;
        const hasRealTransfer = snap.bytesTransferred > 0;

        if (hasRealTransfer) {
          hasTransferredBytesRef.current = true;
          clearStartupTimer();
          armStalledUploadTimer(task);
          setStatusMessage("Envoi du fichier…");
        } else if (!hasTransferredBytesRef.current) {
          setStatusMessage("Préparation de l'envoi…");
        }

        setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
      },
      (err) => {
        if (!isAttemptActive(attemptId)) return;
        clearStartupTimer();
        clearStalledUploadTimer();
        const code = err?.code || "";
        const canRetryWithDirectUpload =
          !hasTransferredBytesRef.current &&
          code !== "storage/unauthorized" &&
          code !== "storage/unauthenticated" &&
          code !== "storage/bucket-not-found" &&
          code !== "storage/project-not-found";

        if (canRetryWithDirectUpload) {
          tryDirectUpload(file, storageRef, attemptId).catch((directUploadError) => {
            if (!isAttemptActive(attemptId)) return;
            invalidateAttempt(attemptId);
            setError(formatUploadError(directUploadError));
            setStatusMessage("");
            setProgress(null);
          });
          return;
        }

        setError(formatUploadError(err));
        setStatusMessage("");
        setProgress(null);
      },
      async () => {
        if (!isAttemptActive(attemptId)) return;
        clearStartupTimer();
        clearStalledUploadTimer();
        await completeUpload(file, task.snapshot.ref, attemptId);
      },
    );
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  const uploading = progress !== null;

  return (
    <div className="file-upload">
      <label className="file-upload__label" style={labelStyle}>{label}</label>

      <div
        className={`file-upload__dropzone ${dragging ? "file-upload__dropzone--dragging" : ""} ${uploading ? "file-upload__dropzone--uploading" : ""} ${value ? "file-upload__dropzone--filled" : ""}`}
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="file-upload__input"
          onChange={(e) => uploadFile(e.target.files?.[0])}
        />

        {uploading ? (
          <div className="file-upload__progress">
            <div className="file-upload__progress-label">Envoi… {progress}%</div>
            <div className="file-upload__progress-bar">
              <div className="file-upload__progress-fill" style={{ width: `${progress}%` }} />
            </div>
            {statusMessage ? (
              <div className="file-upload__status">{statusMessage}</div>
            ) : null}
          </div>
        ) : value ? (
          <div className="file-upload__ready">
            <span className="file-upload__ready-badge">Fichier prêt</span>
            <button
              className="file-upload__icon-link"
              type="button"
              title="Ouvrir le fichier actuel"
              aria-label="Ouvrir le fichier actuel"
              onClick={(e) => {
                e.stopPropagation();
                window.open(value, "_blank", "noopener,noreferrer");
              }}
            >
              <span aria-hidden="true">↗</span>
            </button>
            <span className="file-upload__ready-hint">Cliquer ou déposer pour remplacer</span>
          </div>
        ) : (
          <div className="file-upload__empty">
            <div className="file-upload__empty-icon" aria-hidden="true">⌁</div>
            <div className="file-upload__empty-title">Déposer ou sélectionner un fichier</div>
            <div className="file-upload__empty-hint">{helperText}</div>
          </div>
        )}
      </div>

      {error && (
        <p className="file-upload__error">{error}</p>
      )}
    </div>
  );
}

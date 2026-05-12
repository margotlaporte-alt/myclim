import { useState, useRef } from "react";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
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
export function FileUpload({ value, onChange, accept = "application/pdf", storagePath = "uploads", label = "File" }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const labelStyle = {
    fontSize: "0.78rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#546770",
    display: "block",
    marginBottom: 6,
  };

  async function uploadFile(file) {
    if (!file) return;
    setError("");
    setProgress(0);

    const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const storageRef = ref(storage, `${storagePath}/${safeName}`);
    const task = uploadBytesResumable(storageRef, file);

    task.on(
      "state_changed",
      (snap) => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
      (err) => { setError(err.message); setProgress(null); },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        onChange(url);
        setProgress(null);
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
    <div>
      <label style={labelStyle}>{label}</label>

      {/* Drop zone */}
      <div
        onClick={() => !uploading && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${dragging ? "#1066cc" : "rgba(0,0,0,0.2)"}`,
          borderRadius: 10,
          padding: "20px 16px",
          textAlign: "center",
          cursor: uploading ? "default" : "pointer",
          background: dragging ? "rgba(16,102,204,0.05)" : "rgba(0,0,0,0.02)",
          transition: "border-color 0.15s, background 0.15s",
          userSelect: "none",
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          style={{ display: "none" }}
          onChange={(e) => uploadFile(e.target.files?.[0])}
        />

        {uploading ? (
          <div>
            <div style={{ fontSize: "0.875rem", color: "#1066cc", marginBottom: 8 }}>
              Uploading… {progress}%
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "rgba(0,0,0,0.1)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${progress}%`, background: "#1066cc", borderRadius: 3, transition: "width 0.2s" }} />
            </div>
          </div>
        ) : value ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.85rem", color: "#1066cc", fontWeight: 600 }}>
              📄 File uploaded
            </span>
            <a
              href={value}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: "0.8rem", color: "#546770", textDecoration: "underline" }}
            >
              View current file
            </a>
            <span style={{ fontSize: "0.8rem", color: "#999" }}>· Click or drop to replace</span>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: "1.4rem", marginBottom: 6 }}>📎</div>
            <div style={{ fontSize: "0.875rem", color: "#546770" }}>
              Click to select or drag &amp; drop
            </div>
            <div style={{ fontSize: "0.78rem", color: "#999", marginTop: 4 }}>
              PDF files only · Max 20 MB
            </div>
          </div>
        )}
      </div>

      {error && (
        <p style={{ fontSize: "0.8rem", color: "#e8001c", marginTop: 6 }}>{error}</p>
      )}
    </div>
  );
}

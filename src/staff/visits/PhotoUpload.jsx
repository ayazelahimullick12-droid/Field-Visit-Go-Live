import React, { useRef, useState } from "react";
import { Camera, X } from "lucide-react";

/* ---------- Real photo capture (complaints, observations & stories) ----------
   Files are read client-side, downscaled onto a canvas (so a phone photo
   doesn't balloon the JSON database), and stored as a data URL directly on
   the entry. That also means a photo taken with no signal is simply part of
   the visit saved on the phone. No separate file server — fine for a
   prototype, but worth swapping for real object storage before this holds
   a lot of production traffic. */

export function resizeImageFile(file, maxDim = 1000, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PhotoUpload({ photoUrl, onChange, hint }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setBusy(true);
    try {
      onChange(await resizeImageFile(file));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="upload-box" style={photoUrl ? { padding: 0, overflow: "hidden" } : undefined}>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleFile} />
      {photoUrl ? (
        <div style={{ position: "relative" }}>
          <img src={photoUrl} alt="Attached" style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block", borderRadius: 10 }} />
          <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 6 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>Replace</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(null)} aria-label="Remove photo"><X size={12} /></button>
          </div>
        </div>
      ) : (
        <div role="button" tabIndex={0} onClick={() => !busy && inputRef.current?.click()}
             onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && inputRef.current?.click()} style={{ cursor: "pointer" }}>
          <Camera size={26} style={{ marginBottom: 8 }} />
          <div style={{ fontWeight: 650, fontSize: 13, color: "var(--ink)" }}>{busy ? "Processing…" : "Add a photo"}</div>
          <div style={{ fontSize: 11.5, marginTop: 2 }}>{hint || "JPG or PNG"}</div>
        </div>
      )}
    </div>
  );
}

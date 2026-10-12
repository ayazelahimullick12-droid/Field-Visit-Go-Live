import React, { useEffect, useRef } from "react";
import Portal from "../../lib/Portal";

/** A small "are you sure?" dialog that sits above any sheet. */
export default function ConfirmDialog({ title, children, confirmLabel = "Yes", cancelLabel = "Cancel", tone = "primary", busy, onConfirm, onCancel }) {
  const okRef = useRef(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    okRef.current?.focus();
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); cancelRef.current(); } };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <Portal>
    <div className="confirm-veil" onClick={onCancel}>
      <div className="confirm-box" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2 className="confirm-title">{title}</h2>
        {children && <div className="confirm-body">{children}</div>}
        <div className="confirm-acts">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" ref={okRef} className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`} disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
    </Portal>
  );
}

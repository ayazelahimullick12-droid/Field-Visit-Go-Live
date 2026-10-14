import React from "react";
import { CheckCircle2 } from "lucide-react";
import { isFixed } from "./complaints";

/** How a resolved complaint was fixed: who, when, and the fixer's optional note and photo.
 *  Shown wherever a complaint is shown, so everyone sees what was actually done. */
export default function Resolution({ c, style }) {
  if (!isFixed(c)) return null;
  return (
    <div className="resolution-box" style={style}>
      <div className="rb-head">
        <CheckCircle2 size={14} /> Fixed{c.resolvedBy ? ` by ${c.resolvedBy}` : ""}
        {c.resolvedAt && <span className="rb-when"> · {new Date(c.resolvedAt).toLocaleString()}</span>}
      </div>
      {c.resolutionNotes && <div className="rb-text">{c.resolutionNotes}</div>}
      {c.resolutionPhotoUrl && <img className="rb-photo" src={c.resolutionPhotoUrl} alt="After the fix" />}
    </div>
  );
}

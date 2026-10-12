import React from "react";
import { CloudOff, CloudUpload, Check } from "lucide-react";

/** Tells field staff whether what they recorded has reached the server yet. */
export function SyncPill({ sync }) {
  if (!sync) return null;
  if (sync.pending > 0 && !sync.online) {
    return <span className="sync-pill waiting"><CloudOff size={13} /> Saved on this phone · sends when online</span>;
  }
  if (sync.pending > 0) {
    return <span className="sync-pill waiting"><CloudUpload size={13} /> Sending {sync.pending}…</span>;
  }
  return <span className="sync-pill"><Check size={13} /> All changes sent</span>;
}

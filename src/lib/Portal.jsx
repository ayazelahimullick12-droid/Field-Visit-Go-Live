import { createPortal } from "react-dom";

/* Dialogs render straight into <body>, so a parent's animation or transform can
   never trap a full-screen overlay inside a card. */
export default function Portal({ children }) {
  return typeof document === "undefined" ? children : createPortal(children, document.body);
}

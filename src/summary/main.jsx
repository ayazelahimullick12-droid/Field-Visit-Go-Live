import React from "react";
import ReactDOM from "react-dom/client";
import "../styles/brac.css";
import App from "./App.jsx";

// The public summary needs no sign-in and no offline support, so no service worker here.
ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

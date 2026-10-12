import React from "react";
import ReactDOM from "react-dom/client";
import "../styles/brac.css";
import App from "./App.jsx";
import { registerServiceWorker } from "../lib/registerSW";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

registerServiceWorker();

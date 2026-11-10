import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./theme/tokens.css";
import { isMac } from "./core/keymap";

// The top bar grows on macOS to center on the traffic lights (tokens.css --bar).
if (isMac) document.documentElement.dataset.mac = "";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

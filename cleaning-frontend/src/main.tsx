import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { createQueryClient } from "./queryClient";
import { applyLocale } from "./i18n/locale";
import { applyTheme } from "./theme";
import "@fontsource-variable/manrope";
import "./styles/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root is missing");

applyTheme();
applyLocale();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Service worker registration failed", error);
    });
  });
}

createRoot(root).render(
  <StrictMode>
    <App queryClient={createQueryClient()} />
  </StrictMode>,
);

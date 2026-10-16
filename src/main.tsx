import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./css/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("Flex Bar offline support could not be enabled.", error);
    });
  });
}

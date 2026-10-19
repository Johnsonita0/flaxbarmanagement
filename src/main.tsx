import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { ToastProvider } from "./components/ToastProvider";
import "./lib/pwa";
import "./css/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
    .then(() => navigator.serviceWorker.ready)
    .catch((error: unknown) => {
      console.error("Flex Bar offline support could not be enabled.", error);
    });
}

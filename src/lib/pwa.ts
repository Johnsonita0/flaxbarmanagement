export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

window.addEventListener("beforeinstallprompt", (event: Event) => {
  event.preventDefault();
  deferredInstallPrompt = event as BeforeInstallPromptEvent;
  window.dispatchEvent(new Event("flexbar:install-available"));
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
});

export function getDeferredInstallPrompt() {
  return deferredInstallPrompt;
}

export function clearDeferredInstallPrompt() {
  deferredInstallPrompt = null;
}
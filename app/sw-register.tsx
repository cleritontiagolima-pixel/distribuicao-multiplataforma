"use client";

import { useEffect } from "react";

// Registro do service worker + atualização automática.
// - Electron: SW desregistrado (a versão desktop embute o próprio servidor).
// - Web/PWA/Capacitor: registra o SW; quando um SW NOVO assume o controle
//   (controllerchange), recarrega a página UMA vez — é o que faz celulares e
//   computadores pegarem as melhorias sem o usuário precisar saber de nada.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    const isElectron = !!(window as Window & { electronAPI?: { isElectron?: boolean } }).electronAPI?.isElectron;

    if (isElectron) {
      // Unregister any existing service worker in Electron to prevent
      // stale cached HTML responses from breaking JS loading
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          for (const reg of registrations) {
            reg.unregister();
          }
        });
      }
      // Also clear any caches that might contain stale data
      if ("caches" in window) {
        caches.keys().then((keys) => {
          for (const key of keys) {
            caches.delete(key);
          }
        });
      }
      return;
    }

    if (!("serviceWorker" in navigator)) return;

    // Reload único quando um service worker novo assume o controle: garante
    // que a página rodando é a versão nova (padrão dos PWAs).
    const onControllerChange = () => {
      try {
        if (sessionStorage.getItem("ctube_sw_reloaded") === "1") return;
        sessionStorage.setItem("ctube_sw_reloaded", "1");
      } catch {
        /* ignore */
      }
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        console.log("SW registered:", reg.scope);
        // Procura atualização já na carga (não espera o usuário navegar).
        void reg.update().catch(() => undefined);
        // E checa de novo a cada 60 min enquanto o app estiver aberto.
        setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
      })
      .catch((err) => {
        console.log("SW registration failed:", err);
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}

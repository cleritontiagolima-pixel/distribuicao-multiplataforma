"use client";

// Instalar o CTUBE como aplicativo (PWA). No Android/Desktop o Chrome/Edge
// oferece o prompt nativo (beforeinstallprompt); no iPhone/iPad o Safari não
// expõe o evento — mostramos o passo a passo do "Adicionar à Tela de Início".

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export default function InstallPwaButton({ variant = "full" }: { variant?: "full" | "icon" }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [showIOSHelp, setShowIOSHelp] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const ua = window.navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (ua.includes("Macintosh") && "ontouchend" in document);
    setIsIOS(ios);
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    );

    const onPrompt = (e: Event) => {
      // Impede o mini-infobar do Chrome e guarda o evento para o botão.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Já instalado? Não mostra nada.
  if (standalone || installed) return null;

  const handleClick = async () => {
    if (deferred) {
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferred(null);
      return;
    }
    // Sem prompt disponível (iPhone, ou Chrome já descartou): instruções.
    setShowIOSHelp(true);
  };

  if (variant === "icon") {
    return (
      <>
        <button
          onClick={handleClick}
          title="Instalar app"
          aria-label="Instalar aplicativo"
          className="p-2 rounded-full hover:bg-[var(--secondary)] transition-colors hidden sm:block"
        >
          <Download className="w-5 h-5" />
        </button>
        {showIOSHelp && <IOSHelp onClose={() => setShowIOSHelp(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-sm hover:bg-[var(--secondary)] transition-colors"
        style={{ borderColor: "var(--border)" }}
      >
        <Download className="w-5 h-5 text-[var(--primary)] shrink-0" />
        <span className="flex-1 text-left">
          {isIOS
            ? "Instalar no iPhone (tela de início)"
            : "Instalar CTUBE no aparelho/computador"}
        </span>
      </button>
      {showIOSHelp && <IOSHelp onClose={() => setShowIOSHelp(false)} />}
    </>
  );
}

function IOSHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: "var(--card)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Instalar no iPhone/iPad</h3>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-full hover:bg-[var(--secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <ol className="space-y-3 text-sm leading-relaxed list-decimal list-inside">
          <li>
            Abra o CTUBE no navegador <b>Safari</b> (obrigatório no iPhone).
          </li>
          <li>
            Toque no botão <b>Compartilhar</b> (o quadrado com uma seta para cima)
            na barra inferior do Safari.
          </li>
          <li>
            Role a lista para baixo e toque em <b>&quot;Adicionar à Tela de Início&quot;</b>.
          </li>
          <li>
            Confirme tocando em <b>&quot;Adicionar&quot;</b>. O ícone do CTUBE aparece
            na sua tela de início, como um aplicativo.
          </li>
        </ol>
        <p className="text-xs text-[var(--muted-foreground)] mt-4">
          No Android o botão abre o pedido de instalação direto do Chrome; no
          Windows use o menu (⋮) do Chrome/Edge → &quot;Instalar CTUBE&quot;.
        </p>
        <button
          onClick={onClose}
          className="mt-5 w-full py-2.5 rounded-full bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Entendi
        </button>
      </div>
    </div>
  );
}

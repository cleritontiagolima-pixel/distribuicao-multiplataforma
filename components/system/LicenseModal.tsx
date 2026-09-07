"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X, KeyRound, ExternalLink, Loader2 } from "lucide-react";
import {
  getStoredLicense,
  storeLicense,
  licenseDaysLeft,
  fetchAppConfig,
} from "@/lib/owner";
import {
  setLicenseModalListener,
  dispatchLicenseActivated,
} from "@/lib/license-modal";

export default function LicenseModal() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "error" | "ok">("idle");
  const [message, setMessage] = useState("");
  const [purchaseUrl, setPurchaseUrl] = useState("");

  useEffect(() => {
    setLicenseModalListener((open) => setOpen(open));
    return () => setLicenseModalListener(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const license = getStoredLicense();
    if (license && licenseDaysLeft(license) > 0) {
      // Already active: nothing to do — just close.
      setOpen(false);
      return;
    }
    setEmail(license?.email || "");
    setStatus("idle");
    setMessage("");
    void fetchAppConfig()
      .then((c) => setPurchaseUrl(c.purchaseUrl))
      .catch(() => undefined);
  }, [open]);

  if (!open) return null;

  const activate = async () => {
    setStatus("working");
    setMessage("");
    try {
      const res = await fetch("/api/license/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim(), email: email.trim() }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        valid?: boolean;
        reason?: string;
        email?: string;
        days?: number;
        expiresAt?: number;
      };
      if (!data.ok || !data.valid || !data.expiresAt) {
        const reasons: Record<string, string> = {
          expired: "Este código já expirou. Fale com o suporte para renovar.",
          "email-mismatch": "Este código pertence a outro email.",
          "bad-signature": "Código inválido.",
          "invalid-format": "Código inválido. Confira se copiou o código inteiro.",
        };
        setStatus("error");
        setMessage(reasons[data.reason || ""] || "Não foi possível ativar o código.");
        return;
      }
      storeLicense({
        email: data.email || email.trim().toLowerCase(),
        code: code.trim(),
        activatedAt: Date.now(),
        expiresAt: data.expiresAt,
        days: data.days || 0,
      });
      setStatus("ok");
      dispatchLicenseActivated();
      setTimeout(() => setOpen(false), 600);
    } catch {
      setStatus("error");
      setMessage("Sem conexão no momento. Tente novamente em instantes.");
    }
  };

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto">
      <div
        className="min-h-full flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.6)" }}
        onClick={() => setOpen(false)}
      >
        <div
          className="w-full max-w-[440px] text-center rounded-2xl border p-6 relative"
          style={{ borderColor: "var(--border)", background: "var(--card)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => setOpen(false)}
            aria-label="Fechar"
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-[var(--secondary)] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-14 h-14 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center mx-auto mb-4">
            <KeyRound className="w-7 h-7 text-[var(--primary)]" />
          </div>
          <h2 className="text-xl font-bold mb-2">Downloads offline — Premium</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-5 leading-relaxed">
            O CTUBE continua grátis para assistir. A licença anual (365 dias)
            desbloqueia o download de áudio para ouvir offline neste aparelho.
          </p>

          <div className="text-left space-y-3 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Seu email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className="w-full h-11 px-4 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Código de ativação
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="CTUBE-..."
                className="w-full h-11 px-4 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition-colors font-mono text-sm"
              />
            </div>
            <button
              onClick={() => void activate()}
              disabled={status === "working" || !code.trim() || !email.trim()}
              className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-[var(--primary)] text-white font-medium transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {status === "working" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              Ativar licença
            </button>
            {status === "error" && (
              <p className="text-sm text-[var(--destructive)] px-1">{message}</p>
            )}
            {status === "ok" && (
              <p className="text-sm text-green-600 dark:text-green-400 px-1">
                Licença ativada com sucesso! Agora você pode baixar.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {purchaseUrl && (
              <a
                href={purchaseUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-[var(--border)] text-sm font-medium hover:bg-[var(--secondary)] transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Comprar 1 ano de CTUBE
              </a>
            )}
            <Link
              href="/login"
              className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
            >
              Entrar na minha conta
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
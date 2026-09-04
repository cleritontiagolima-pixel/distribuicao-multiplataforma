"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Lock, KeyRound, ExternalLink, CheckCircle2, Loader2 } from "lucide-react";
import { OWNER_EMAIL } from "@/lib/constants";
import {
  fetchAppConfig,
  getStoredLicense,
  storeLicense,
  licenseDaysLeft,
  type AppConfig,
} from "@/lib/owner";
import { getCurrentUser } from "@/lib/storage";

export default function PlanGate() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "working" | "error" | "ok">("idle");
  const [message, setMessage] = useState("");
  const [daysLeft, setDaysLeft] = useState(0);

  const evaluate = useCallback(async () => {
    let cfg: AppConfig | null = null;
    try {
      cfg = await fetchAppConfig();
    } catch {
      cfg = null; // offline → never lock the user out
    }
    setConfig(cfg);
    if (!cfg || cfg.plan !== "paid") {
      setBlocked(false);
      return;
    }

    // The owner never gets locked out, and login/admin pages stay reachable.
    const user = getCurrentUser();
    const path = window.location.pathname;
    if (path === "/login" || path.startsWith("/admin")) {
      setBlocked(false);
      return;
    }
    if (user && user.email === OWNER_EMAIL) {
      setBlocked(false);
      return;
    }

    const license = getStoredLicense();
    const valid = license && license.expiresAt > Date.now();
    setDaysLeft(licenseDaysLeft(license));
    setEmail((prev) => prev || license?.email || user?.email || "");
    setBlocked(!valid);
  }, []);

  useEffect(() => {
    void evaluate();
    const interval = setInterval(() => void evaluate(), 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [evaluate]);

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
      setBlocked(false);
      setDaysLeft(licenseDaysLeft(getStoredLicense()));
    } catch {
      setStatus("error");
      setMessage("Sem conexão no momento. Tente novamente em instantes.");
    }
  };

  // When the plan is not paid, render nothing.
  if (!blocked) return null;

  return (
    <div className="fixed inset-0 z-[200] overflow-y-auto">
      <div
        className="min-h-full flex items-center justify-center p-4"
        style={{ background: "var(--background)" }}
      >
        <div className="w-full max-w-[440px] text-center">
          <div className="w-16 h-16 rounded-2xl bg-[var(--primary)]/10 flex items-center justify-center mx-auto mb-5">
            {daysLeft > 0 ? (
              <CheckCircle2 className="w-9 h-9 text-[var(--primary)]" />
            ) : (
              <Lock className="w-9 h-9 text-[var(--primary)]" />
            )}
          </div>
          <h1 className="text-2xl font-bold mb-2">
            {daysLeft > 0 ? "Licença ativa" : "CTUBE Premium"}
          </h1>
          <p className="text-sm text-[var(--muted-foreground)] mb-6 leading-relaxed">
            {daysLeft > 0
              ? `Seu acesso expirou? Não — você tem ${daysLeft} dia(s) restantes. Se esta tela persistir, clique em ativar novamente com o mesmo código.`
              : "O CTUBE agora é um serviço pago. Ative sua licença anual (365 dias) para continuar assistindo sem anúncios."}
          </p>

          <div className="rounded-2xl border p-5 text-left space-y-3 mb-4" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
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
                Licença ativada com sucesso! Bem-vindo de volta.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => void fetchAppConfig(true).then((c) => (window.location.href = c.purchaseUrl))}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-[var(--border)] text-sm font-medium hover:bg-[var(--secondary)] transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Comprar 1 ano de CTUBE
            </button>
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

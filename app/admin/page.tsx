"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import {
  ShieldCheck,
  Bug,
  KeyRound,
  RefreshCw,
  Copy,
  Check,
  Trash2,
  Download,
  ExternalLink,
  Lock,
  Unlock,
} from "lucide-react";
import {
  APP_VERSION,
  GITHUB_REPO_OWNER,
  GITHUB_REPO_NAME,
  OWNER_EMAIL,
  getPlatform,
} from "@/lib/constants";
import {
  clearOwnerSession,
  getOwnerSession,
  setOwnerSession,
  type AppConfig,
} from "@/lib/owner";
import {
  getLocalErrors,
  clearLocalErrors,
  type ErrorEntry,
} from "@/lib/telemetry";
import { getCurrentUser } from "@/lib/storage";

interface IssuedLicense {
  email: string;
  days: number;
  code: string;
  createdAt: number;
}

const ISSUED_KEY = "ctube_issued_licenses_v1";

function readIssued(): IssuedLicense[] {
  try {
    const raw = localStorage.getItem(ISSUED_KEY);
    return raw ? (JSON.parse(raw) as IssuedLicense[]) : [];
  } catch {
    return [];
  }
}

function writeIssued(list: IssuedLicense[]) {
  try {
    localStorage.setItem(ISSUED_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

export default function AdminPage() {
  const user = getCurrentUser();
  const isOwnerUser = !!user && user.email === OWNER_EMAIL;

  const [verified, setVerified] = useState(false);
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [working, setWorking] = useState(false);

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [serverEvents, setServerEvents] = useState<Array<Record<string, unknown>>>([]);
  const [issued, setIssued] = useState<IssuedLicense[]>([]);

  const [issueEmail, setIssueEmail] = useState("");
  const [issueDays, setIssueDays] = useState(365);
  const [newCode, setNewCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [release, setRelease] = useState<{ tag?: string | null; releaseUrl?: string | null } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/app-config");
      if (res.ok) setConfig((await res.json()) as AppConfig);
    } catch {
      /* offline */
    }
    setErrors(getLocalErrors());
    setIssued(readIssued());
  }, []);

  useEffect(() => {
    if (!isOwnerUser) return;
    setVerified(!!getOwnerSession());
    void refresh();
    if (getOwnerSession()) {
      void fetch("/api/telemetry", { headers: { "x-owner-token": getOwnerSession()!.token } })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setServerEvents(d.events || []))
        .catch(() => undefined);
      void fetch("/api/update")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setRelease(d))
        .catch(() => undefined);
    }
  }, [isOwnerUser, refresh]);

  const verify = async () => {
    setWorking(true);
    setAuthError("");
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: OWNER_EMAIL, password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; token?: string };
      if (data.ok && data.token) {
        setOwnerSession(data.token);
        setVerified(true);
        setPassword("");
        window.location.reload();
      } else {
        setAuthError("Senha incorreta.");
      }
    } catch {
      setAuthError("Erro de conexão. Tente novamente.");
    } finally {
      setWorking(false);
    }
  };

  const issueLicense = async () => {
    const session = getOwnerSession();
    if (!session) return;
    setWorking(true);
    try {
      const res = await fetch("/api/license/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-owner-token": session.token },
        body: JSON.stringify({ email: issueEmail, days: issueDays }),
      });
      const data = (await res.json()) as { ok?: boolean; code?: string; email?: string; days?: number; error?: string };
      if (data.ok && data.code) {
        setNewCode(data.code);
        const list = readIssued();
        list.unshift({ email: data.email || "", days: data.days || 0, code: data.code, createdAt: Date.now() });
        writeIssued(list);
        setIssued(list);
        setCopied(false);
      } else {
        setAuthError(data.error === "unauthorized" ? "Sessão expirada. Verifique novamente." : "Email inválido.");
      }
    } catch {
      setAuthError("Erro de conexão.");
    } finally {
      setWorking(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const exportErrors = () => {
    const blob = new Blob([JSON.stringify({ errors, serverEvents }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ctube-errors-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOwnerUser) {
    return (
      <AppShell>
        <div className="max-w-[600px] mx-auto p-8 text-center">
          <ShieldCheck className="w-12 h-12 text-[var(--muted-foreground)] mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Área restrita</h1>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">
            Esta área é exclusiva do desenvolvedor do CTUBE. Entre com a conta do dono para acessar.
          </p>
          <Link
            href="/login?returnTo=/admin"
            className="px-6 py-2.5 rounded-full bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Entrar com a conta do dono
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1100px] mx-auto px-4 md:px-6 py-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-[var(--primary)]" />
            <div>
              <h1 className="text-xl font-semibold">Painel do desenvolvedor</h1>
              <p className="text-xs text-[var(--muted-foreground)]">
                CTUBE v{APP_VERSION} • {getPlatform()} • {user?.email}
              </p>
            </div>
          </div>
          {verified && (
            <button
              onClick={() => {
                clearOwnerSession();
                setVerified(false);
                setServerEvents([]);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--border)] text-sm hover:bg-[var(--secondary)] transition-colors"
            >
              <Lock className="w-4 h-4" />
              Bloquear painel
            </button>
          )}
        </div>

        {!verified ? (
          <div className="rounded-2xl border p-6 max-w-[480px]" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
            <h2 className="font-semibold mb-1">Confirmar identidade</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              Digite a senha do dono para liberar o painel por 12 horas.
            </p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void verify()}
              placeholder="Senha do dono"
              className="w-full h-11 px-4 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] mb-3 focus:outline-none focus:border-[var(--primary)]"
            />
            {authError && <p className="text-sm text-[var(--destructive)] mb-3">{authError}</p>}
            <button
              onClick={() => void verify()}
              disabled={working || !password}
              className="w-full h-11 rounded-xl bg-[var(--primary)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {working ? "Verificando..." : "Desbloquear painel"}
            </button>
          </div>
        ) : (
          <>
            {/* Row: plan + release */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <div className="flex items-center gap-2 mb-1">
                  {config?.plan === "paid" ? (
                    <Lock className="w-4 h-4 text-[var(--primary)]" />
                  ) : (
                    <Unlock className="w-4 h-4 text-green-600 dark:text-green-400" />
                  )}
                  <h2 className="font-semibold">Plano atual</h2>
                </div>
                <p className="text-sm text-[var(--muted-foreground)] mb-2">
                  {config?.plan === "paid"
                    ? "Modo PAGO ativo — usuários precisam de licença (365 dias)."
                    : "Modo GRATUITO ativo — todos podem usar sem licença."}
                </p>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">
                  Para mudar, configure as variáveis de ambiente no Vercel/Keys tab e
                  faça deploy de novo:
                </p>
                <pre className="text-[11px] mt-2 p-3 rounded-lg overflow-x-auto" style={{ background: "var(--secondary)" }}>
{`CTUBE_PLAN=paid
CTUBE_PURCHASE_URL=https://...`}
                </pre>
                {config?.purchaseUrl && (
                  <p className="text-xs mt-2 text-[var(--muted-foreground)] break-all">
                    Link de compra atual: {config.purchaseUrl}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
                <div className="flex items-center gap-2 mb-1">
                  <RefreshCw className="w-4 h-4 text-[var(--primary)]" />
                  <h2 className="font-semibold">Atualização do app</h2>
                </div>
                <p className="text-sm text-[var(--muted-foreground)] mb-2">
                  Instalado: v{APP_VERSION}
                  {release?.tag ? ` • GitHub mais recente: ${release.tag}` : ""}
                </p>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed mb-3">
                  Para publicar uma atualização: aumente a versão no package.json, faça
                  commit/push e crie uma tag <code>vX.Y.Z</code>. As Actions geram os
                  instaladores e criam o Release com os links de download.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <a
                    href={`https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/releases`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-[var(--border)] text-xs font-medium hover:bg-[var(--secondary)] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Ver releases
                  </a>
                  <a
                    href={`https://github.com/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-[var(--border)] text-xs font-medium hover:bg-[var(--secondary)] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Ver Actions
                  </a>
                </div>
              </div>
            </div>

            {/* License issuer */}
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <div className="flex items-center gap-2 mb-3">
                <KeyRound className="w-4 h-4 text-[var(--primary)]" />
                <h2 className="font-semibold">Gerar licença anual</h2>
              </div>
              <div className="flex gap-2 flex-col sm:flex-row">
                <input
                  type="email"
                  value={issueEmail}
                  onChange={(e) => setIssueEmail(e.target.value)}
                  placeholder="email do cliente"
                  className="flex-1 h-11 px-4 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                />
                <input
                  type="number"
                  value={issueDays}
                  onChange={(e) => setIssueDays(parseInt(e.target.value, 10) || 365)}
                  min={1}
                  max={3650}
                  className="w-full sm:w-32 h-11 px-4 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] focus:outline-none focus:border-[var(--primary)]"
                />
                <button
                  onClick={() => void issueLicense()}
                  disabled={working || !issueEmail}
                  className="h-11 px-5 rounded-xl bg-[var(--primary)] text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  Gerar
                </button>
              </div>
              {newCode && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <code
                    className="text-xs px-3 py-2 rounded-lg break-all flex-1 min-w-0"
                    style={{ background: "var(--secondary)" }}
                  >
                    {newCode}
                  </code>
                  <button
                    onClick={() => void copy(newCode)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-[var(--border)] text-xs hover:bg-[var(--secondary)] transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
              )}
              {issued.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium mb-2 text-[var(--muted-foreground)]">
                    Licenças emitidas neste dispositivo ({issued.length})
                  </p>
                  <div className="max-h-44 overflow-y-auto space-y-1">
                    {issued.map((l) => (
                      <div key={l.code} className="flex items-center justify-between gap-2 text-xs px-3 py-2 rounded-lg" style={{ background: "var(--secondary)" }}>
                        <span className="truncate">
                          {l.email} — {l.days} dias
                        </span>
                        <button onClick={() => void copy(l.code)} className="shrink-0 hover:opacity-70">
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Errors */}
            <div className="rounded-2xl border p-5" style={{ borderColor: "var(--border)", background: "var(--card)" }}>
              <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4 text-[var(--primary)]" />
                  <h2 className="font-semibold">Erros registrados</h2>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={exportErrors}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--border)] text-xs hover:bg-[var(--secondary)] transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportar
                  </button>
                  <button
                    onClick={() => {
                      clearLocalErrors();
                      setErrors([]);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[var(--border)] text-xs hover:bg-[var(--secondary)] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Limpar locais
                  </button>
                </div>
              </div>
              <p className="text-xs text-[var(--muted-foreground)] mb-3">
                {errors.length} erro(s) neste dispositivo • {serverEvents.length} recebido(s) pelo servidor
                (buffer recente — para histórico longo, veja os logs do Vercel).
              </p>
              <div className="max-h-72 overflow-y-auto space-y-1.5">
                {errors.length === 0 && serverEvents.length === 0 && (
                  <p className="text-sm text-[var(--muted-foreground)] py-4 text-center">
                    Nenhum erro registrado. 🎉
                  </p>
                )}
                {errors.map((e, i) => (
                  <div key={i} className="text-xs px-3 py-2 rounded-lg break-words" style={{ background: "var(--secondary)" }}>
                    <span className="text-[var(--muted-foreground)]">
                      {new Date(e.ts).toLocaleString("pt-BR")} [{e.platform}/{e.version}] {e.kind}
                    </span>
                    <div className="mt-0.5 text-[var(--foreground)]">{e.message}</div>
                    {e.stack && <pre className="mt-1 whitespace-pre-wrap text-[10px] opacity-70 max-h-24 overflow-y-auto">{e.stack}</pre>}
                  </div>
                ))}
                {serverEvents.map((ev, i) => (
                  <div key={`srv-${i}`} className="text-xs px-3 py-2 rounded-lg break-words" style={{ background: "var(--secondary)" }}>
                    <span className="text-[var(--muted-foreground)]">servidor</span>
                    <pre className="mt-0.5 whitespace-pre-wrap text-[10px] opacity-80 max-h-24 overflow-y-auto">
                      {JSON.stringify(ev, null, 1)}
                    </pre>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

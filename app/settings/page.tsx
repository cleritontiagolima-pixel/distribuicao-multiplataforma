"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { getCurrentUser, clearHistory, logout } from "@/lib/storage";
import { Settings, Trash2, LogOut, Info, ShieldCheck, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_VERSION, OWNER_EMAIL } from "@/lib/constants";
import { getStoredLicense, licenseDaysLeft } from "@/lib/owner";
import Link from "next/link";

export default function SettingsPage() {
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push("/login?returnTo=/settings");
    }
  }, [router]);

  if (!user) return null;

  return (
    <AppShell>
      <div className="max-w-[800px] mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center gap-3 mb-6">
          <Settings className="w-6 h-6 text-[var(--primary)]" />
          <h1 className="text-xl font-semibold">Configurações</h1>
        </div>

        <div className="space-y-4">
          {/* Account */}
          <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "var(--card)" }}>
            <h2 className="font-medium mb-3">Conta</h2>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-full bg-[var(--primary)] flex items-center justify-center text-white font-bold text-lg">
                {user.name[0].toUpperCase()}
              </div>
              <div>
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-[var(--muted-foreground)]">{user.email}</p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                router.push("/");
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-[var(--destructive)] hover:bg-[var(--secondary)] transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sair da conta
            </button>
          </div>

          {/* Data */}
          <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "var(--card)" }}>
            <h2 className="font-medium mb-3">Dados</h2>
            <button
              onClick={() => {
                if (confirm("Tem certeza que deseja limpar todo o histórico?")) {
                  clearHistory();
                }
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-[var(--destructive)] hover:bg-[var(--secondary)] transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Limpar histórico de reprodução
            </button>
          </div>

          {/* License status */}
          {(() => {
            const license = getStoredLicense();
            if (!license) return null;
            const days = licenseDaysLeft(license);
            return (
              <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "var(--card)" }}>
                <div className="flex items-center gap-2 mb-2">
                  <KeyRound className="w-4 h-4 text-[var(--primary)]" />
                  <h2 className="font-medium">Sua licença Premium</h2>
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {days > 0 ? (
                    <>
                      Ativa para <b className="text-[var(--foreground)]">{license.email}</b> — restam{" "}
                      {days} dia(s). Downloads offline liberados neste aparelho.
                    </>
                  ) : (
                    <>Expirou. Renove pelo contato do desenvolvedor para continuar baixando áudio offline.</>
                  )}
                </p>
                <Link
                  href="/downloads"
                  className="inline-block mt-3 text-sm text-[var(--primary)] hover:underline"
                >
                  Ver meus downloads
                </Link>
              </div>
            );
          })()}

          {/* Owner entry */}
          {user && user.email === OWNER_EMAIL && (
            <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "var(--card)" }}>
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheck className="w-4 h-4 text-[var(--primary)]" />
                <h2 className="font-medium">Desenvolvedor</h2>
              </div>
              <p className="text-sm text-[var(--muted-foreground)] mb-3">
                Acesso ao painel de erros, licenças e controle do plano.
              </p>
              <button
                onClick={() => router.push("/admin")}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--primary)] text-white text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <ShieldCheck className="w-4 h-4" />
                Abrir painel do desenvolvedor
              </button>
            </div>
          )}

          {/* About */}
          <div className="rounded-xl border border-[var(--border)] p-4" style={{ background: "var(--card)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-[var(--muted-foreground)]" />
              <h2 className="font-medium">Sobre</h2>
            </div>
            <div className="text-sm text-[var(--muted-foreground)] space-y-1">
              <p>CTUBE v{APP_VERSION}</p>
              <p>Um cliente de vídeo inspirado no YouTube e FreeTube.</p>
              <p>Dados são salvos localmente neste dispositivo.</p>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Play, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { login, register, getCurrentUser } from "@/lib/storage";
import { cn } from "@/lib/utils";

function LoginForm() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      router.push(returnTo);
    }
  }, [router, returnTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Simulate network delay
    await new Promise((r) => setTimeout(r, 300));

    let loggedEmail = "";
    if (isLogin) {
      const user = login(email, password);
      if (!user) {
        setError("Email ou senha incorretos");
        setLoading(false);
        return;
      }
      loggedEmail = user.email;
    } else {
      if (!name.trim()) {
        setError("Nome é obrigatório");
        setLoading(false);
        return;
      }
      const user = register(name.trim(), email, password);
      if (!user) {
        setError("Este email já está em uso");
        setLoading(false);
        return;
      }
      loggedEmail = user.email;
    }

    setLoading(false);
    // Owner account goes straight to the developer panel.
    if (loggedEmail === "ctinformatic@gmail.com" && (!returnTo || returnTo === "/")) {
      router.push("/admin");
    } else {
      router.push(returnTo);
    }
  };

  return (
    <div className="w-full max-w-[400px]">
      {/* Back to home */}
      <Link
        href="/"
        className="flex items-center gap-2 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar
      </Link>

      {/* Logo */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-12 h-12 rounded-xl bg-[var(--primary)] flex items-center justify-center">
          <Play className="w-7 h-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">CTUBE</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {isLogin ? "Entre na sua conta" : "Crie sua conta"}
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <div>
            <label className="block text-sm font-medium mb-1.5">Nome</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              className="w-full h-11 px-4 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="seu@email.com"
            required
            className="w-full h-11 px-4 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition-colors"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">Senha</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={4}
              className="w-full h-11 px-4 pr-11 rounded-xl border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)] transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-[var(--secondary)] transition-colors"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4 text-[var(--muted-foreground)]" />
              ) : (
                <Eye className="w-4 h-4 text-[var(--muted-foreground)]" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 px-3 py-2 rounded-lg">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={cn(
            "w-full h-11 rounded-xl bg-[var(--primary)] text-white font-medium transition-opacity",
            loading ? "opacity-70 cursor-not-allowed" : "hover:opacity-90"
          )}
        >
          {loading ? "Carregando..." : isLogin ? "Entrar" : "Criar conta"}
        </button>
      </form>

      {/* Switch */}
      <p className="text-sm text-center mt-6 text-[var(--muted-foreground)]">
        {isLogin ? "Não tem uma conta?" : "Já tem uma conta?"}{" "}
        <button
          onClick={() => {
            setIsLogin(!isLogin);
            setError("");
          }}
          className="text-[var(--primary)] hover:underline font-medium"
        >
          {isLogin ? "Criar conta" : "Entrar"}
        </button>
      </p>

      {/* Note about local storage */}
      <p className="text-xs text-center mt-4 text-[var(--muted-foreground)]">
        Os dados são salvos apenas neste dispositivo.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--background)" }}>
      <Suspense fallback={<div className="text-[var(--muted-foreground)]">Carregando...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}

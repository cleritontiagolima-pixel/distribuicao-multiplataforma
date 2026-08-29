import Link from "next/link";
import { Play } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4" style={{ background: "var(--background)" }}>
      <div className="w-16 h-16 rounded-2xl bg-[var(--primary)] flex items-center justify-center mb-6">
        <Play className="w-9 h-9 text-white" />
      </div>
      <h1 className="text-6xl font-bold mb-4">404</h1>
      <p className="text-lg text-[var(--muted-foreground)] mb-6">
        Página não encontrada
      </p>
      <Link
        href="/"
        className="px-6 py-3 rounded-full bg-[var(--primary)] text-white font-medium hover:opacity-90 transition-opacity"
      >
        Voltar ao início
      </Link>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { ThumbsUp } from "lucide-react";
import { getCurrentUser } from "@/lib/storage";

export default function LikedPage() {
  const [user, setUser] = useState<ReturnType<typeof getCurrentUser>>(null);
  const router = useRouter();

  useEffect(() => {
    const currentUser = getCurrentUser();
    setUser(currentUser);
    if (!currentUser) {
      router.push("/login?returnTo=/liked");
    }
  }, [router]);

  if (!user) return null;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-4">
        <div className="flex items-center gap-3 mb-6">
          <ThumbsUp className="w-6 h-6 text-[var(--primary)]" />
          <h1 className="text-xl font-semibold">Vídeos curtidos</h1>
        </div>

        <div className="flex flex-col items-center justify-center py-16">
          <ThumbsUp className="w-12 h-12 text-[var(--muted-foreground)] mb-4" />
          <p className="text-lg text-[var(--muted-foreground)] mb-2">
            Em breve
          </p>
          <p className="text-sm text-[var(--muted-foreground)]">
            A funcionalidade de curtidas será disponibilizada em uma atualização futura
          </p>
        </div>
      </div>
    </AppShell>
  );
}

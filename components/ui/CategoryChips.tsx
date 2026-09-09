"use client";

import { useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const categories = [
  "Todos",
  "Música",
  "Jogos",
  "Ao vivo",
  "Notícias",
  "Programação",
  "Ciência",
  "Filmes",
  "Comédia",
  "Animação",
  "Esportes",
  "Educação",
  "Culinária",
  "Tecnologia",
  "Podcasts",
  "Vlogs",
  "ASMR",
  "DIY",
  "Viagens",
];

interface CategoryChipsProps {
  selected?: string;
  onSelect?: (category: string) => void;
}

export default function CategoryChips({
  selected = "Todos",
  onSelect,
}: CategoryChipsProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = 200;
    const newScroll =
      direction === "left"
        ? scrollRef.current.scrollLeft - amount
        : scrollRef.current.scrollLeft + amount;
    scrollRef.current.scrollTo({ left: newScroll, behavior: "smooth" });
  };

  return (
    <div className="relative flex items-center gap-2 py-3">
      {/* Left arrow (desktop only — no mouse hover to scroll on touch) */}
      <button
        onClick={() => handleScroll("left")}
        className="hidden md:flex absolute left-0 z-10 w-10 h-full items-center justify-center"
        style={{
          background:
            "linear-gradient(to right, var(--background) 50%, transparent)",
        }}
      >
        <ChevronLeft className="w-5 h-5" />
      </button>

      {/* Chips */}
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto scrollbar-hide px-1 md:px-8"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onSelect?.(cat)}
            className={cn(
              "category-chip",
              selected === cat && "active"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Right arrow (desktop only) */}
      <button
        onClick={() => handleScroll("right")}
        className="hidden md:flex absolute right-0 z-10 w-10 h-full items-center justify-center"
        style={{
          background:
            "linear-gradient(to left, var(--background) 50%, transparent)",
        }}
      >
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

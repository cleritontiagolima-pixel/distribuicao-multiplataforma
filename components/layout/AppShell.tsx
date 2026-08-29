"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Home,
  Compass,
  Clock,
  PlaySquare,
  ThumbsUp,
  ListVideo,
  Settings,
  Menu,
  X,
  Search,
  Bell,
  User,
  LogOut,
  Play,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getCurrentUser, logout, type User as UserType } from "@/lib/storage";

// App Context
interface AppContextType {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  user: UserType | null;
}

const AppContext = createContext<AppContextType>({
  sidebarOpen: true,
  setSidebarOpen: () => {},
  user: null,
});

export const useApp = () => useContext(AppContext);

// Sidebar Navigation
const navItems = [
  { icon: Home, label: "Início", href: "/" },
  { icon: Compass, label: "Explorar", href: "/trending" },
  { icon: TrendingUp, label: "Em alta", href: "/trending" },
  { icon: Clock, label: "Histórico", href: "/history", auth: true },
  { icon: PlaySquare, label: "Suas playlists", href: "/playlists", auth: true },
  { icon: ThumbsUp, label: "Vídeos curtidos", href: "/liked", auth: true },
  { icon: ListVideo, label: "Assistir mais tarde", href: "/watch-later", auth: true },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [miniSidebar, setMiniSidebar] = useState(false);
  const [user, setUser] = useState<UserType | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setUser(getCurrentUser());
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setShowUserMenu(false);
  }, [pathname]);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (searchQuery.trim()) {
        router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      }
    },
    [searchQuery, router]
  );

  const handleLogout = () => {
    logout();
    setUser(null);
    router.push("/");
  };

  return (
    <AppContext.Provider value={{ sidebarOpen, setSidebarOpen, user }}>
      <div className="flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header
          className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between h-14 px-4"
          style={{ background: "var(--background)" }}
        >
          {/* Left: Menu + Logo */}
          <div className="flex items-center gap-2 min-w-[200px]">
            <button
              onClick={() => {
                if (window.innerWidth < 768) {
                  setMobileMenuOpen(!mobileMenuOpen);
                } else {
                  setMiniSidebar(!miniSidebar);
                }
              }}
              className="p-2 rounded-full hover:bg-[var(--secondary)] transition-colors"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link href="/" className="flex items-center gap-1.5">
              <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
                <Play className="w-5 h-5 text-white" />
              </div>
              <span className="text-lg font-bold tracking-tight hidden sm:block">
                CTUBE
              </span>
            </Link>
          </div>

          {/* Center: Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-[640px] mx-4">
            <div className="flex">
              <input
                type="text"
                placeholder="Pesquisar"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 h-10 px-4 rounded-l-full border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:border-[var(--primary)]"
              />
              <button
                type="submit"
                className="h-10 px-5 rounded-r-full border border-l-0 border-[var(--border)] bg-[var(--secondary)] hover:bg-[var(--sidebar-hover)] transition-colors"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Right: User */}
          <div className="flex items-center gap-2 min-w-[200px] justify-end">
            <button className="p-2 rounded-full hover:bg-[var(--secondary)] transition-colors hidden sm:block">
              <Bell className="w-5 h-5" />
            </button>

            {user ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center text-white font-medium text-sm"
                >
                  {user.name[0].toUpperCase()}
                </button>
                {showUserMenu && (
                  <div
                    className="absolute right-0 top-12 w-72 rounded-xl border border-[var(--border)] py-2 shadow-xl z-50"
                    style={{ background: "var(--popover)" }}
                  >
                    <div className="px-4 py-3 border-b border-[var(--border)]">
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-[var(--muted-foreground)]">
                        {user.email}
                      </p>
                    </div>
                    <Link
                      href="/playlists"
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--secondary)] transition-colors"
                    >
                      <PlaySquare className="w-4 h-4" />
                      Suas playlists
                    </Link>
                    <Link
                      href="/settings"
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--secondary)] transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                      Configurações
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--secondary)] transition-colors w-full text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      Sair
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border)] hover:bg-[var(--secondary)] transition-colors"
              >
                <User className="w-4 h-4" />
                <span className="text-sm hidden sm:block">Entrar</span>
              </Link>
            )}
          </div>
        </header>

        <div className="flex flex-1 pt-14">
          {/* Desktop Sidebar */}
          <aside
            className={cn(
              "hidden md:flex flex-col fixed top-14 bottom-0 left-0 z-30 overflow-y-auto overflow-x-hidden transition-all duration-200",
              miniSidebar ? "w-[72px]" : "w-[240px]"
            )}
            style={{ background: "var(--background)" }}
          >
            <nav className="flex flex-col gap-0.5 p-2">
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);
                if (item.auth && !user) return null;

                if (miniSidebar) {
                  return (
                    <Link
                      key={item.href + item.label}
                      href={item.href}
                      className={cn(
                        "flex flex-col items-center gap-1 p-2 rounded-lg transition-colors",
                        isActive
                          ? "bg-[var(--secondary)]"
                          : "hover:bg-[var(--secondary)]"
                      )}
                      title={item.label}
                    >
                      <item.icon
                        className={cn(
                          "w-5 h-5",
                          isActive && "text-[var(--primary)]"
                        )}
                      />
                      <span className="text-[10px] text-[var(--muted-foreground)]">
                        {item.label.length > 10
                          ? item.label.substring(0, 10) + "..."
                          : item.label}
                      </span>
                    </Link>
                  );
                }

                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    className={cn("sidebar-item", isActive && "active")}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    <span className="text-sm truncate">{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>

          {/* Mobile Sidebar Overlay */}
          {mobileMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-50 bg-black/50 md:hidden"
                onClick={() => setMobileMenuOpen(false)}
              />
              <aside
                className="fixed top-0 bottom-0 left-0 z-50 w-[280px] overflow-y-auto md:hidden"
                style={{ background: "var(--background)" }}
              >
                <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
                  <Link href="/" className="flex items-center gap-1.5">
                    <div className="w-8 h-8 rounded-lg bg-[var(--primary)] flex items-center justify-center">
                      <Play className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-lg font-bold">CTUBE</span>
                  </Link>
                  <button
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 rounded-full hover:bg-[var(--secondary)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="flex flex-col gap-0.5 p-2">
                  {navItems.map((item) => {
                    const isActive =
                      item.href === "/"
                        ? pathname === "/"
                        : pathname.startsWith(item.href);
                    if (item.auth && !user) return null;
                    return (
                      <Link
                        key={item.href + item.label}
                        href={item.href}
                        className={cn(
                          "sidebar-item",
                          isActive && "active"
                        )}
                      >
                        <item.icon className="w-5 h-5 shrink-0" />
                        <span className="text-sm">{item.label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </aside>
            </>
          )}

          {/* Main Content */}
          <main
            className={`main-content ${miniSidebar ? "main-content-mini" : "main-content-full"}`}
          >
            {children}
          </main>
        </div>
      </div>
    </AppContext.Provider>
  );
}

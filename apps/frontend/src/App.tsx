import "./index.css";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { useDarkMode } from "./hooks/useDarkMode.js";
import { useHistory } from "./hooks/useHistory.js";
import { AuthProvider, useAuth } from "./hooks/useAuth.js";
import { HomePage } from "./components/HomePage.js";
import { CreatePage } from "./components/CreatePage.js";
import { CapsuleView } from "./components/CapsuleView.js";
import { HistoryPage } from "./components/HistoryPage.js";
import { AboutPage } from "./components/AboutPage.js";
import { ChatPage } from "./components/ChatPage.js";
import { AuthModal } from "./components/AuthModal.js";
import { SunburstIcon } from "./components/Icons.js";
import { BotanicalFlowerBee } from "./components/BotanicalFlowerBee.js";
import { User, LogOut, MessageSquare } from "lucide-react";

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export type Page = "home" | "create" | "history" | "chat" | "about" | "share";

const SHARE_RE = /^\/share\/[^/?#]+\/?$/i;

function detectPage(): Page {
  const path = window.location.pathname;
  if (SHARE_RE.test(path)) return "share";
  if (/^\/create\/?$/i.test(path)) return "create";
  if (/^\/history\/?$/i.test(path) || /^\/secrets\/?$/i.test(path)) return "history";
  if (/^\/chat\/?$/i.test(path) || /^\/messages\/?$/i.test(path)) return "chat";
  if (/^\/about\/?$/i.test(path)) return "about";
  if (/^\/how-it-works\/?$/i.test(path)) return "home";
  return "home";
}

function useRouter(): { page: Page; navigate: (to: Page) => void } {
  const [page, setPage] = useState<Page>(detectPage);

  useEffect(() => {
    const handler = () => {
      setPage(detectPage());
    };
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
    };
  }, []);

  function navigate(to: Page): void {
    const paths: Record<Page, string> = {
      home: "/",
      create: "/create",
      history: "/secrets",
      chat: "/chat",
      about: "/about",
      share: window.location.pathname,
    };
    window.history.pushState({}, "", paths[to]);
    setPage(to);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return { page, navigate };
}

// ---------------------------------------------------------------------------
// Navigation Bar
// ---------------------------------------------------------------------------

type NavProps = {
  page: Page;
  navigate: (to: Page) => void;
  dark: boolean;
  onToggleDark: () => void;
};

function Nav({ page, navigate, dark, onToggleDark }: NavProps) {
  const { user, openAuthModal, logout } = useAuth();

  const tabs: { id: Page; label: string; icon?: any }[] = [
    { id: "create", label: "Create" },
    { id: "history", label: "Secrets" },
    { id: "chat", label: "Chat" },
    { id: "about", label: "About" },
  ];

  return (
    <header
      className="sticky top-0 z-50 backdrop-blur-md transition-colors duration-300"
      style={{
        backgroundColor: "color-mix(in srgb, var(--color-veil-bg) 84%, transparent)",
        borderBottom: "1px solid rgba(106, 86, 67, 0.08)",
      }}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo with Brand Sunburst + VEIL */}
        <button
          id="nav-logo-btn"
          type="button"
          onClick={() => navigate("home")}
          className="flex items-center gap-2.5 font-serif text-lg font-semibold tracking-[0.18em] focus-veil rounded-lg py-1 px-1.5 transition-opacity hover:opacity-85"
          style={{
            fontFamily: "var(--font-serif)",
            color: "var(--color-veil-ink)",
          }}
          aria-label="Veil home"
        >
          <SunburstIcon className="w-5 h-5 text-ember shrink-0" />
          <span className="uppercase text-sm sm:text-base font-bold tracking-[0.2em]">VEIL</span>
        </button>

        {/* Desktop Tabs */}
        <nav
          className="hidden md:flex items-center gap-2"
          role="navigation"
          aria-label="Main navigation"
        >
          {tabs.map(({ id, label }) => {
            const active = page === id;
            return (
              <button
                key={id}
                id={`nav-tab-${id}`}
                type="button"
                onClick={() => navigate(id)}
                className="px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all duration-150 focus-veil cursor-pointer flex items-center gap-1.5"
                style={{
                  backgroundColor: active ? "rgba(201, 93, 38, 0.12)" : "transparent",
                  color: active ? "var(--color-veil-ember)" : "var(--color-veil-muted)",
                }}
                aria-current={active ? "page" : undefined}
              >
                {id === "chat" && <MessageSquare className="w-3.5 h-3.5" />}
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* Right CTA / Auth + Theme Toggle */}
        <div className="flex items-center gap-3">
          {user ? (
            <div className="flex items-center gap-2">
              <button
                id="nav-user-profile-btn"
                type="button"
                onClick={() => navigate("chat")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium bg-white/20 dark:bg-white/5 border-white/10 hover:border-amber-500/30 transition-colors"
                style={{ color: "var(--color-veil-ink)" }}
              >
                <div className="w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-mono font-bold">
                  {user.username.substring(0, 1).toUpperCase()}
                </div>
                <span>@{user.username}</span>
              </button>
              <button
                id="nav-logout-btn"
                type="button"
                onClick={() => logout()}
                className="p-2 rounded-xl border border-white/10 text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              id="nav-signin-btn"
              type="button"
              onClick={() => openAuthModal("login")}
              className="text-xs px-3.5 py-1.5 rounded-xl border font-medium transition-all hover:bg-white/40 dark:hover:bg-white/10 cursor-pointer flex items-center gap-1.5"
              style={{
                borderColor: "rgba(201, 93, 38, 0.35)",
                color: "var(--color-veil-ink)",
                backgroundColor: "rgba(255, 255, 255, 0.25)",
              }}
            >
              <User className="w-3.5 h-3.5 text-ember" />
              <span>Sign In</span>
            </button>
          )}

          {/* Dark mode toggle */}
          <button
            id="nav-theme-toggle-btn"
            type="button"
            onClick={onToggleDark}
            className="w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-xl transition-all border focus-veil cursor-pointer"
            style={{
              color: "var(--color-veil-muted)",
              backgroundColor: "rgba(255, 255, 255, 0.3)",
              borderColor: "var(--color-veil-border)",
            }}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? (
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.75">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile navigation bar */}
      <div
        className="flex md:hidden items-center justify-around px-4 py-2 border-t"
        style={{ borderColor: "rgba(106, 86, 67, 0.08)" }}
      >
        {tabs.map(({ id, label }) => {
          const active = page === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => navigate(id)}
              className="px-2.5 py-1 text-xs font-medium rounded-md"
              style={{
                color: active ? "var(--color-veil-ember)" : "var(--color-veil-muted)",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------------------
// Share Layout
// ---------------------------------------------------------------------------

function ShareLayout({ dark, onToggleDark }: { dark: boolean; onToggleDark: () => void }) {
  return (
    <div className="min-h-screen relative overflow-hidden" style={{ backgroundColor: "var(--color-veil-bg)" }}>
      <div className="bokeh-orb-1 top-[-80px] right-[10%]" />
      <div className="bokeh-orb-2 bottom-[40px] left-[5%]" />

      {/* Header */}
      <header
        className="sticky top-0 z-50 backdrop-blur-md"
        style={{
          backgroundColor: "color-mix(in srgb, var(--color-veil-bg) 88%, transparent)",
          borderBottom: "1px solid var(--color-veil-border)",
        }}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <a
            href="/"
            className="flex items-center gap-2.5 font-serif text-lg font-semibold tracking-[0.18em] focus-veil rounded"
            style={{ fontFamily: "var(--font-serif)", color: "var(--color-veil-ink)" }}
          >
            <SunburstIcon className="w-5 h-5 text-ember" />
            <span className="uppercase text-sm sm:text-base font-bold tracking-[0.2em]">VEIL</span>
          </a>
          <button
            type="button"
            onClick={onToggleDark}
            className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors border focus-veil cursor-pointer"
            style={{
              color: "var(--color-veil-muted)",
              borderColor: "var(--color-veil-border)",
              backgroundColor: "rgba(255, 255, 255, 0.3)",
            }}
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? (
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Recipient Content with Botanical flower */}
      <main className="relative z-10 max-w-4xl mx-auto px-6 py-12">
        <div className="relative">
          <CapsuleView />

          {/* Botanical Flower Accent */}
          <div
            className="hidden lg:block absolute -right-12 bottom-0 w-[220px] pointer-events-none select-none z-10"
            style={{ filter: "drop-shadow(0 14px 28px rgba(120, 60, 20, 0.12))" }}
          >
            <BotanicalFlowerBee />
          </div>
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Footer
// ---------------------------------------------------------------------------

function Footer() {
  return (
    <footer
      className="border-t mt-20 px-6 py-10 text-center text-xs"
      style={{
        borderColor: "rgba(106, 86, 67, 0.12)",
        color: "var(--color-veil-muted)",
      }}
    >
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <SunburstIcon className="w-4 h-4 text-ember" />
          <span
            style={{
              fontFamily: "var(--font-serif)",
              color: "var(--color-veil-ink)",
              fontSize: "0.95rem",
              fontWeight: 600,
              letterSpacing: "0.1em",
            }}
          >
            VEIL
          </span>
          <span className="opacity-30">·</span>
          <span>Encrypted ephemeral sharing</span>
        </div>

        <div className="flex items-center gap-4 text-muted">
          <span>Self-destructing</span>
          <span className="opacity-30">·</span>
          <span>No server logs</span>
          <span className="opacity-30">·</span>
          <span>Open protocol</span>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------
// App Root
// ---------------------------------------------------------------------------

function AppContent() {
  const { page, navigate } = useRouter();
  const { dark, toggle: toggleDark } = useDarkMode();
  const { user } = useAuth();
  const { entries, addEntry, markRevoked, clearHistory } = useHistory(user?.id);

  if (page === "share") {
    return <ShareLayout dark={dark} onToggleDark={toggleDark} />;
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--color-veil-bg)" }}>
      <Nav page={page} navigate={navigate} dark={dark} onToggleDark={toggleDark} />

      <main id="main-content">
        {page === "home" && <HomePage onNavigate={navigate} onAddToHistory={addEntry} />}
        {page === "create" && (
          <CreatePage
            onNavigateHome={() => navigate("home")}
            onNavigateSecrets={() => navigate("history")}
            onNavigateChat={(convId) => {
              if (convId) {
                try {
                  sessionStorage.setItem("veil_target_chat_conv", convId);
                } catch {
                  // ignore
                }
              }
              navigate("chat");
            }}
            addToHistory={addEntry}
          />
        )}
        {page === "history" && (
          <HistoryPage
            entries={entries}
            onClear={clearHistory}
            onRevoke={markRevoked}
            onNavigateCreate={() => navigate("create")}
          />
        )}
        {page === "chat" && <ChatPage />}
        {page === "about" && <AboutPage onNavigateCreate={() => navigate("create")} />}
      </main>

      <AuthModal />
      <Footer />
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

// ---------------------------------------------------------------------------
// Mount
// ---------------------------------------------------------------------------

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

export default App;

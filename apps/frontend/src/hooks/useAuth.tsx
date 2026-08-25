import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { UserProfile } from "@secureshare/shared";
import {
  clearAuthStorage,
  getCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  updatePrivacy as apiUpdatePrivacy,
  getAuthToken,
} from "../services/api.js";
import { clearStorage as clearHistoryStorage } from "./useHistory.js";

type AuthContextType = {
  user: UserProfile | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  register: (u: string, p: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUserPrivacy: (isPublic: boolean) => Promise<void>;
  isAuthModalOpen: boolean;
  authModalMode: "login" | "register";
  openAuthModal: (mode?: "login" | "register") => void;
  closeAuthModal: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register">("login");

  const clearClientSession = () => {
    clearAuthStorage();
    clearHistoryStorage(user?.id ?? null);
    setUser(null);
    setLoading(false);
    setIsAuthModalOpen(false);
    setAuthModalMode("login");
  };

  const refreshUser = async () => {
    const token = getAuthToken();
    if (!token) {
      clearClientSession();
      return;
    }

    try {
      const { user: profile } = await getCurrentUser();
      setUser(profile);
    } catch {
      clearClientSession();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (u: string, p: string) => {
    setUser(null);
    const res = await loginUser({ username: u, password: p });
    setUser(res.user);
    setIsAuthModalOpen(false);
  };

  const register = async (u: string, p: string) => {
    setUser(null);
    const res = await registerUser({ username: u, password: p });
    setUser(res.user);
    setIsAuthModalOpen(false);
  };

  const logout = async () => {
    try {
      await logoutUser();
    } finally {
      clearClientSession();
    }
  };

  const updateUserPrivacy = async (isPublic: boolean) => {
    try {
      const res = await apiUpdatePrivacy(isPublic);
      setUser(res.user);
    } catch (err) {
      console.error("Failed to update privacy:", err);
      throw err;
    }
  };

  const openAuthModal = (mode: "login" | "register" = "login") => {
    setAuthModalMode(mode);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        refreshUser,
        updateUserPrivacy,
        isAuthModalOpen,
        authModalMode,
        openAuthModal,
        closeAuthModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

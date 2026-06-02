"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { clearStreamTokenCache } from "../utils/streamToken";

export interface User {
  id: number;
  username: string;
  role: "admin" | "user";
  permissions: string[];
}

import { normalizePermissions } from "../utils/permissions";

function normalizeUser(raw: User): User {
  return {
    ...raw,
    permissions: normalizePermissions(raw.permissions),
  };
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  hasPermission: (feature: string) => boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const storedToken = localStorage.getItem("radar_auth_token");
    const storedUser = localStorage.getItem("radar_auth_user");

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(normalizeUser(JSON.parse(storedUser)));
    } else if (pathname !== "/login") {
      router.push("/login");
    }
    setIsLoading(false);
  }, [pathname, router]);

  const login = (newToken: string, newUser: User) => {
    const normalized = normalizeUser(newUser);
    localStorage.setItem("radar_auth_token", newToken);
    localStorage.setItem("radar_auth_user", JSON.stringify(normalized));
    setToken(newToken);
    setUser(normalized);
    router.push("/");
  };

  const logout = () => {
    localStorage.removeItem("radar_auth_token");
    localStorage.removeItem("radar_auth_user");
    setToken(null);
    setUser(null);
    clearStreamTokenCache();
    router.push("/login");
  };

  const hasPermission = (feature: string) => {
    if (!user) return false;
    if (user.role === "admin") return true;
    return user.permissions.includes(feature);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, hasPermission, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

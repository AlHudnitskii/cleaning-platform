import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, applySession, refreshSession } from "../api/client";
import { toApiError } from "../api/errors";
import type { TokenResponse } from "../api/types";
import { loadProfile, onSessionExpired, saveProfile, setAccessToken } from "./session";
import { AuthContext, type AuthState } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(() => (loadProfile() ? { status: "loading" } : { status: "anonymous" }));

  const clearSession = useCallback(() => {
    setAccessToken(null);
    saveProfile(null);
    queryClient.clear();
    setState({ status: "anonymous" });
  }, [queryClient]);

  useEffect(() => {
    const profile = loadProfile();
    if (!profile) return;
    let cancelled = false;
    refreshSession()
      .then((session) => {
        if (!cancelled) setState({ status: "authenticated", user: session.user, offline: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (toApiError(error).isNetwork) setState({ status: "authenticated", user: profile, offline: true });
        else clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  useEffect(() => onSessionExpired(clearSession), [clearSession]);

  const acceptSession = useCallback((session: TokenResponse) => {
    applySession(session);
    setState({ status: "authenticated", user: session.user, offline: false });
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await api.post<TokenResponse>("/auth/login", { email, password });
      acceptSession(session);
      return session.user;
    },
    [acceptSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      setAccessToken(null);
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo(() => ({ state, login, logout, acceptSession }), [state, login, logout, acceptSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

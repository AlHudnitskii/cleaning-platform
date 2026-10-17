import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, applySession, refreshSession } from "../api/client";
import { toApiError } from "../api/errors";
import type { TokenResponse, UserResponse } from "../api/types";
import { showToast } from "../components/toast";
import { t } from "../i18n/locale";
import {
  loadProfile,
  onSessionExpired,
  onSessionUserChanged,
  PROFILE_KEY,
  saveProfile,
  setAccessToken,
  setSessionUser,
} from "./session";
import { AuthContext, type AuthState } from "./useAuth";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(() => (loadProfile() ? { status: "loading" } : { status: "anonymous" }));

  const clearSession = useCallback(() => {
    setAccessToken(null);
    setSessionUser(null);
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

  useEffect(
    () =>
      onSessionUserChanged((user) => {
        queryClient.clear();
        setState({ status: "authenticated", user, offline: false });
        showToast(t().auth.switchedTo(user.email), "info");
      }),
    [queryClient],
  );

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== PROFILE_KEY) return;
      const profile = loadProfile();
      if (!profile) {
        clearSession();
        return;
      }
      if (state.status === "authenticated" && state.user.id === profile.id) return;
      refreshSession()
        .then((session) => setState({ status: "authenticated", user: session.user, offline: false }))
        .catch(clearSession);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [clearSession, state]);

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

  const updateUser = useCallback((user: UserResponse) => {
    saveProfile(user);
    setState((previous) => (previous.status === "authenticated" ? { ...previous, user } : previous));
  }, []);

  const value = useMemo(
    () => ({ state, login, logout, acceptSession, updateUser }),
    [state, login, logout, acceptSession, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

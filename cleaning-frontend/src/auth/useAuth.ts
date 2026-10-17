import { createContext, useContext } from "react";

import type { TokenResponse, UserResponse } from "../api/types";

export type AuthState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "authenticated"; user: UserResponse; offline: boolean };

export interface AuthContextValue {
  state: AuthState;
  login: (email: string, password: string) => Promise<UserResponse>;
  logout: () => Promise<void>;
  acceptSession: (session: TokenResponse) => void;
  updateUser: (user: UserResponse) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export function useCurrentUser(): UserResponse {
  const { state } = useAuth();
  if (state.status !== "authenticated") throw new Error("useCurrentUser requires an authenticated session");
  return state.user;
}

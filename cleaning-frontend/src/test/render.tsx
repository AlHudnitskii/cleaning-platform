import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import type { UserResponse } from "../api/types";
import { AppRoutes } from "../App";
import { AuthProvider } from "../auth/AuthContext";
import { saveProfile } from "../auth/session";
import { server, sessionHandlers } from "./server";

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
    </output>
  );
}

export function renderApp(route: string, user?: UserResponse) {
  if (user) {
    saveProfile(user);
    server.use(...sessionHandlers(user));
  }
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <AppRoutes />
          <LocationProbe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...result, user: userEvent.setup(), queryClient };
}

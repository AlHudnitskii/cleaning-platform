import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import type { UserResponse } from "../api/types";
import { LocalizedRoutes } from "../App";
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
          <LocalizedRoutes />
          <LocationProbe />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...result, user: userEvent.setup(), queryClient };
}

export async function chooseOption(user: UserEvent, label: string, option: string, scope: HTMLElement = document.body) {
  await user.click(within(scope).getByLabelText(label));
  const listbox = await screen.findByRole("listbox");
  await user.click(await within(listbox).findByRole("option", { name: option }));
}

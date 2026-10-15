import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

import { setAccessToken } from "../auth/session";
import { server } from "./server";

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  setAccessToken(null);
});

afterAll(() => server.close());

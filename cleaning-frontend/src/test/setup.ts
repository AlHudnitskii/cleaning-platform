import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";

import { setAccessToken } from "../auth/session";
import { setLocale } from "../i18n/locale";
import { server } from "./server";

configure({ asyncUtilTimeout: 5000 });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  setAccessToken(null);
  setLocale("en");
});

afterAll(() => server.close());

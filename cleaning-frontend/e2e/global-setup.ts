import { request } from "@playwright/test";

import { ADMIN, API_URL } from "./accounts";

export default async function globalSetup(): Promise<void> {
  const api = await request.newContext();
  try {
    const response = await api.post(`${API_URL}/auth/login`, { data: ADMIN });
    if (!response.ok()) throw new Error(`login answered ${String(response.status())}`);
  } catch (error) {
    throw new Error(
      `The backend at ${API_URL} is not ready (${String(error)}). Start it with \`python3 start.py\` and seed it with seed.py before running the e2e tests.`,
    );
  } finally {
    await api.dispose();
  }
}

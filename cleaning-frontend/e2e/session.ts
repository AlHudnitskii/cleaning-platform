import { request, type Browser, type Page } from "@playwright/test";

import { API_URL, type Account } from "./accounts";

export async function signIn(browser: Browser, account: Account): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
  return page;
}

export async function apiAs(account: Account) {
  const anonymous = await request.newContext();
  const login = await anonymous.post(`${API_URL}/auth/login`, { data: account });
  const { access_token } = (await login.json()) as { access_token: string };
  await anonymous.dispose();
  return request.newContext({ extraHTTPHeaders: { Authorization: `Bearer ${access_token}` } });
}

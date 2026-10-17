export const API_URL = process.env.E2E_API_URL ?? "http://127.0.0.1:7071/api";

export interface Account {
  email: string;
  password: string;
}

export const ADMIN: Account = { email: "admin@cleaning.com", password: "admin123" };
export const MANAGER: Account = { email: "manager.de@cleaning.com", password: "manager123" };
export const CLEANER: Account = { email: "cleaner1@cleaning.com", password: "cleaner123" };

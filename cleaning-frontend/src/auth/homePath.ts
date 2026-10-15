import type { UserRole } from "../api/types";

export function homePath(role: UserRole): string {
  return role === "cleaner" ? "/my-tasks" : "/tasks";
}

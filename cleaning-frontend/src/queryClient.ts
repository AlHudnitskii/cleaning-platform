import { QueryClient } from "@tanstack/react-query";

import { toApiError } from "./api/errors";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const kind = toApiError(error).kind;
          return failureCount < 2 && (kind === "server" || kind === "network");
        },
      },
    },
  });
}

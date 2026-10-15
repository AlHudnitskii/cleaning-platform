import { http, HttpResponse } from "msw";

import { getAccessToken, onSessionExpired, setAccessToken } from "../auth/session";
import { makeSession, MANAGER } from "../test/fixtures";
import { server } from "../test/server";
import { getJson } from "./client";
import { ApiError, errorMessage, toApiError } from "./errors";

async function failure(request: Promise<unknown>): Promise<ApiError> {
  return request.then(() => {
    throw new Error("expected the request to fail");
  }, toApiError);
}

describe("API client", () => {
  it("refreshes an expired access token once and retries the request", async () => {
    setAccessToken("expired");
    const seen: (string | null)[] = [];
    let refreshes = 0;
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        const header = request.headers.get("Authorization");
        seen.push(header);
        return header === "Bearer fresh"
          ? HttpResponse.json({ ok: true })
          : HttpResponse.json({ error: "Token has expired" }, { status: 401 });
      }),
      http.post("*/api/auth/refresh", () => {
        refreshes += 1;
        return HttpResponse.json(makeSession(MANAGER, "fresh"));
      }),
    );

    await expect(Promise.all([getJson("/tasks"), getJson("/tasks")])).resolves.toEqual([{ ok: true }, { ok: true }]);

    expect(refreshes).toBe(1);
    expect(getAccessToken()).toBe("fresh");
    expect(seen.filter((h) => h === "Bearer fresh")).toHaveLength(2);
  });

  it("expires the session when the refresh token is rejected", async () => {
    setAccessToken("expired");
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);
    server.use(
      http.get("*/api/tasks", () => HttpResponse.json({ error: "Token has expired" }, { status: 401 })),
      http.post("*/api/auth/refresh", () => HttpResponse.json({ error: "Session is no longer valid" }, { status: 401 })),
    );

    await expect(getJson("/tasks")).rejects.toMatchObject({ kind: "unauthorized" });

    expect(expired).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();
    unsubscribe();
  });

  it("does not expire the session when refresh fails because of the network", async () => {
    setAccessToken("expired");
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);
    server.use(
      http.get("*/api/tasks", () => HttpResponse.json({ error: "Token has expired" }, { status: 401 })),
      http.post("*/api/auth/refresh", () => HttpResponse.error()),
    );

    await expect(getJson("/tasks")).rejects.toBeInstanceOf(ApiError);

    expect(expired).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("omits empty query parameters", async () => {
    let query = "";
    server.use(
      http.get("*/api/tasks", ({ request }) => {
        query = new URL(request.url).search;
        return HttpResponse.json({});
      }),
    );

    await getJson("/tasks", { page: 1, status: undefined, country: "" });

    expect(query).toBe("?page=1");
  });
});

describe("toApiError", () => {
  it.each([
    [400, "validation"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [404, "not_found"],
    [409, "conflict"],
    [413, "too_large"],
    [500, "server"],
  ] as const)("maps HTTP %i to %s", async (status, kind) => {
    server.use(http.get("*/api/x", () => HttpResponse.json({ error: "message" }, { status })));

    const error = await failure(getJson("/x"));

    expect(error).toMatchObject({ kind, status });
  });

  it("hides server internals behind a generic message", async () => {
    server.use(http.get("*/api/x", () => new HttpResponse("<html>Traceback…</html>", { status: 500 })));

    const error = await failure(getJson("/x"));

    expect(error.message).toBe("The server failed to process the request. Try again later.");
  });

  it("joins validation details into the message", async () => {
    server.use(
      http.get("*/api/x", () =>
        HttpResponse.json(
          { error: "Validation failed", details: [{ field: "title", message: "Title must be at least 3 characters" }] },
          { status: 400 },
        ),
      ),
    );

    const message = errorMessage(await failure(getJson("/x")));

    expect(message).toBe("title: Title must be at least 3 characters");
  });

  it("treats the service worker offline response as a network error", async () => {
    server.use(http.get("*/api/x", () => HttpResponse.json({ error: "offline", offline: true }, { status: 503 })));

    const error = await failure(getJson("/x"));

    expect(error.isNetwork).toBe(true);
  });
});

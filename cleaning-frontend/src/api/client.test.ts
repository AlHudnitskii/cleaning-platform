import { http, HttpResponse } from "msw";

import { getAccessToken, onSessionExpired, setAccessToken } from "../auth/session";
import { makeSession, MANAGER } from "../test/fixtures";
import { server } from "../test/server";
import { api } from "./client";
import { setLocale } from "../i18n/locale";
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

    await expect(Promise.all([api.get("/tasks"), api.get("/tasks")])).resolves.toEqual([{ ok: true }, { ok: true }]);

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

    await expect(api.get("/tasks")).rejects.toMatchObject({ kind: "unauthorized" });

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

    await expect(api.get("/tasks")).rejects.toBeInstanceOf(ApiError);

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

    await api.get("/tasks", { page: 1, status: undefined, country: "" });

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

    const error = await failure(api.get("/x"));

    expect(error).toMatchObject({ kind, status });
  });

  it("hides server internals behind a generic message", async () => {
    server.use(http.get("*/api/x", () => new HttpResponse("<html>Traceback…</html>", { status: 500 })));

    const error = await failure(api.get("/x"));

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

    const message = errorMessage(await failure(api.get("/x")));

    expect(message).toBe("Title must be at least 3 characters");
  });

  it("treats a dropped connection as a network error", async () => {
    server.use(http.get("*/api/x", () => HttpResponse.error()));

    const error = await failure(api.get("/x"));

    expect(error).toMatchObject({ kind: "network", status: null, message: "No connection to the server." });
  });

  it("sends JSON bodies with the access token and reads the JSON reply", async () => {
    setAccessToken("token");
    let received: { auth: string | null; type: string | null; body: unknown } | null = null;
    server.use(
      http.post("*/api/x", async ({ request }) => {
        received = {
          auth: request.headers.get("Authorization"),
          type: request.headers.get("Content-Type"),
          body: await request.json(),
        };
        return HttpResponse.json({ id: "1" }, { status: 201 });
      }),
    );

    await expect(api.post("/x", { title: "Clean" })).resolves.toEqual({ id: "1" });

    expect(received).toEqual({ auth: "Bearer token", type: "application/json", body: { title: "Clean" } });
  });

  it("asks the server to answer in the interface language", async () => {
    let language: string | null = null;
    server.use(
      http.get("*/api/x", ({ request }) => {
        language = request.headers.get("Accept-Language");
        return HttpResponse.json({});
      }),
    );

    setLocale("ru");
    await api.get("/x");

    expect(language).toBe("ru");
  });

  it("resolves empty replies such as 204 without failing", async () => {
    server.use(http.delete("*/api/x", () => new HttpResponse(null, { status: 204 })));

    await expect(api.delete("/x")).resolves.toBeNull();
  });

  it("treats the service worker offline response as a network error", async () => {
    server.use(http.get("*/api/x", () => HttpResponse.json({ error: "offline", offline: true }, { status: 503 })));

    const error = await failure(api.get("/x"));

    expect(error.isNetwork).toBe(true);
  });
});

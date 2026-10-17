import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { CLEANER } from "../test/fixtures";
import { chooseOption, renderApp } from "../test/render";
import { server } from "../test/server";
import { setTheme } from "../theme";

const AVATAR = "https://blob.example/avatars/me.png?sig=1";

describe("Profile page", () => {
  afterEach(() => setTheme("light"));

  it("switches the theme where the top bar has no room for the switch", async () => {
    const { user } = renderApp("/profile", CLEANER);
    await screen.findByRole("heading", { name: "Profile" });

    await chooseOption(user, "Theme", "Dark theme");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveTextContent("Dark theme");
  });

  it("shows the cleaner's own figures", async () => {
    server.use(
      http.get("*/api/profile/stats", () =>
        HttpResponse.json({
          period_days: 30,
          completed: 12,
          open: 3,
          on_review: 1,
          overdue: 2,
          avg_quality: 4.5,
          avg_work_seconds: 5400,
        }),
      ),
    );
    renderApp("/profile", CLEANER);

    const card = (await screen.findByRole("heading", { name: "My figures" })).closest("section") as HTMLElement;
    expect(await within(card).findByText("12")).toBeInTheDocument();
    expect(within(card).getByText(/Tasks assigned to you/)).toBeInTheDocument();
    expect(within(card).getByText("1 on review")).toBeInTheDocument();
    expect(within(card).getByText("4.5")).toBeInTheDocument();
    expect(within(card).getByText("1 h 30 min")).toBeInTheDocument();
  });

  it("offers a retry when the figures fail to load", async () => {
    server.use(http.get("*/api/profile/stats", () => HttpResponse.json({ error: "Internal server error" }, { status: 500 })));
    renderApp("/profile", CLEANER);

    const card = (await screen.findByRole("heading", { name: "My figures" })).closest("section") as HTMLElement;
    expect(await within(card).findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("saves the name and phone and shows the name in the top bar", async () => {
    let sent: unknown = null;
    server.use(
      http.patch("*/api/profile", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ...CLEANER, full_name: "Anna Berg", phone: "+49 30 1234567" });
      }),
    );
    const { user } = renderApp("/profile", CLEANER);
    const details = (await screen.findByRole("heading", { name: "Personal details" })).closest("section") as HTMLElement;
    expect(within(details).getByRole("button", { name: "Save details" })).toBeDisabled();

    await user.type(within(details).getByLabelText("Name"), "Anna Berg");
    await user.type(within(details).getByLabelText("Phone"), "+49 30 1234567");
    await user.click(within(details).getByRole("button", { name: "Save details" }));

    await waitFor(() => expect(sent).toEqual({ full_name: "Anna Berg", phone: "+49 30 1234567" }));
    expect(await screen.findByText("Details saved.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Profile of Anna Berg (Cleaner)" })).toBeInTheDocument();
  });

  it("shows why the server refused the details", async () => {
    server.use(
      http.patch("*/api/profile", () =>
        HttpResponse.json({ error: "Please check the entered values", details: [{ field: "phone", message: "Phone: invalid" }] }, { status: 400 }),
      ),
    );
    const { user } = renderApp("/profile", CLEANER);
    const details = (await screen.findByRole("heading", { name: "Personal details" })).closest("section") as HTMLElement;

    await user.type(within(details).getByLabelText("Phone"), "call me");
    await user.click(within(details).getByRole("button", { name: "Save details" }));

    expect(await within(details).findByRole("alert")).toBeInTheDocument();
  });

  it("uploads a profile photo and lets the user remove it", async () => {
    let uploaded = false;
    server.use(
      http.post("*/api/profile/avatar", () => {
        uploaded = true;
        return HttpResponse.json({ ...CLEANER, avatar_url: AVATAR });
      }),
      http.delete("*/api/profile/avatar", () => HttpResponse.json({ ...CLEANER, avatar_url: null })),
    );
    const { user } = renderApp("/profile", CLEANER);
    const details = (await screen.findByRole("heading", { name: "Personal details" })).closest("section") as HTMLElement;

    await user.upload(within(details).getByLabelText("Add a photo"), new File(["x"], "me.png", { type: "image/png" }));

    await waitFor(() => expect(uploaded).toBe(true));
    await waitFor(() => expect(details.querySelector("img.avatar-photo")).toHaveAttribute("src", AVATAR));
    await user.click(within(details).getByRole("button", { name: "Remove photo" }));
    await waitFor(() => expect(details.querySelector("img.avatar-photo")).toBeNull());
  });
});

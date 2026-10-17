import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ADMIN, MANAGER, makeTemplate } from "../test/fixtures";
import { chooseOption, renderApp } from "../test/render";
import { server } from "../test/server";

const TEMPLATE_ID = "77777777-7777-4777-8777-777777777777";

describe("Checklist templates", () => {
  it("lists the templates with their steps", async () => {
    server.use(http.get("*/api/checklist-templates", () => HttpResponse.json([makeTemplate()])));
    renderApp("/checklist-templates", MANAGER);

    const card = (await screen.findByRole("heading", { name: "Bathroom" })).closest("li");
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("2 steps")).toBeInTheDocument();
    expect(within(card as HTMLElement).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Clean the sink",
      "Mop the floor",
    ]);
  });

  it("explains an empty list", async () => {
    renderApp("/checklist-templates", MANAGER);

    expect(await screen.findByText("No templates yet")).toBeInTheDocument();
  });

  it("offers a retry when the list fails to load", async () => {
    let calls = 0;
    server.use(
      http.get("*/api/checklist-templates", () => {
        calls += 1;
        return calls === 1
          ? HttpResponse.json({ error: "Internal server error" }, { status: 500 })
          : HttpResponse.json([makeTemplate()]);
      }),
    );
    const { user } = renderApp("/checklist-templates", MANAGER);

    await user.click(await screen.findByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Bathroom" })).toBeInTheDocument();
  });

  it("creates a template in the manager's country", async () => {
    let sent: unknown = null;
    server.use(
      http.post("*/api/checklist-templates", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(makeTemplate({ name: "Office" }), { status: 201 });
      }),
    );
    const { user } = renderApp("/checklist-templates", MANAGER);
    await screen.findByText("No templates yet");

    await user.click(screen.getByRole("button", { name: "New template" }));
    const panel = screen.getByRole("dialog", { name: "New template" });
    expect(within(panel).getByRole("button", { name: "Create template" })).toBeDisabled();
    expect(within(panel).queryByRole("combobox", { name: "Country" })).not.toBeInTheDocument();
    await user.type(within(panel).getByLabelText("Name"), "Office");
    await user.type(within(panel).getByRole("textbox", { name: "New checklist step" }), "Wipe desks{Enter}");
    await user.click(within(panel).getByRole("button", { name: "Create template" }));

    await waitFor(() => expect(sent).toEqual({ name: "Office", items: ["Wipe desks"] }));
    expect(await screen.findByText("Template “Office” created")).toBeInTheDocument();
  });

  it("shows why the server refused a template", async () => {
    server.use(
      http.post("*/api/checklist-templates", () =>
        HttpResponse.json({ error: "A template with this name already exists in this country" }, { status: 409 }),
      ),
    );
    const { user } = renderApp("/checklist-templates", MANAGER);
    await screen.findByText("No templates yet");

    await user.click(screen.getByRole("button", { name: "New template" }));
    const panel = screen.getByRole("dialog", { name: "New template" });
    await user.type(within(panel).getByLabelText("Name"), "Bathroom");
    await user.type(within(panel).getByRole("textbox", { name: "New checklist step" }), "Mop{Enter}");
    await user.click(within(panel).getByRole("button", { name: "Create template" }));

    expect(await within(panel).findByRole("alert")).toHaveTextContent("already exists");
  });

  it("lets an admin filter by country and pick the country of a new template", async () => {
    const requested: (string | null)[] = [];
    let sent: unknown = null;
    server.use(
      http.get("*/api/checklist-templates", ({ request }) => {
        requested.push(new URL(request.url).searchParams.get("country"));
        return HttpResponse.json([]);
      }),
      http.post("*/api/checklist-templates", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(makeTemplate({ country: "NL" }), { status: 201 });
      }),
    );
    const { user } = renderApp("/checklist-templates", ADMIN);
    await screen.findByText("No templates yet");

    await chooseOption(user, "Country", "Netherlands");
    await waitFor(() => expect(requested).toContain("NL"));
    await user.click(screen.getByRole("button", { name: "New template" }));
    const panel = screen.getByRole("dialog", { name: "New template" });
    await user.type(within(panel).getByLabelText("Name"), "Kitchen");
    await user.type(within(panel).getByRole("textbox", { name: "New checklist step" }), "Wipe counters{Enter}");
    await user.click(within(panel).getByRole("button", { name: "Create template" }));

    await waitFor(() => expect(sent).toEqual({ name: "Kitchen", items: ["Wipe counters"], country: "NL" }));
  });

  it("deletes a template after confirmation", async () => {
    let deleted = false;
    server.use(
      http.get("*/api/checklist-templates", () => HttpResponse.json(deleted ? [] : [makeTemplate()])),
      http.delete(`*/api/checklist-templates/${TEMPLATE_ID}`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp("/checklist-templates", MANAGER);

    await user.click(await screen.findByRole("button", { name: "Delete Bathroom" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete the template “Bathroom”?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete template" }));

    expect(await screen.findByText("No templates yet")).toBeInTheDocument();
    expect(deleted).toBe(true);
  });
});

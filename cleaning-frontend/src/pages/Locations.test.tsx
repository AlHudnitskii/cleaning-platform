import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ADMIN, MANAGER, makeLocation } from "../test/fixtures";
import { renderApp } from "../test/render";
import { server } from "../test/server";

const LOCATIONS = [
  makeLocation(),
  makeLocation({ id: "b", name: "Berlin", level: "city", parent_id: "77777777-7777-4777-8777-777777777777", full_name: "Germany / Berlin" }),
  makeLocation({ id: "c", name: "Berlin HQ", level: "building", parent_id: "b", full_name: "Germany / Berlin / Berlin HQ" }),
  makeLocation({ id: "d", name: "Munich", level: "city", parent_id: "77777777-7777-4777-8777-777777777777", full_name: "Germany / Munich" }),
];

describe("Locations page", () => {
  it("filters the tree, keeps parents of matches and highlights the match", async () => {
    server.use(http.get("*/api/locations", () => HttpResponse.json(LOCATIONS)));
    const { user } = renderApp("/locations", ADMIN);
    const tree = await screen.findByRole("list", { name: "Location tree" });
    expect(within(tree).getByText("Munich")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox", { name: "Search locations" }), "hq");

    const filtered = screen.getByRole("list", { name: "Location tree" });
    expect(within(filtered).queryByText("Munich")).not.toBeInTheDocument();
    expect(within(filtered).getByText("Germany")).toBeInTheDocument();
    expect(within(filtered).getByText("HQ", { selector: "mark" })).toBeInTheDocument();
  });

  it("explains when nothing matches", async () => {
    server.use(http.get("*/api/locations", () => HttpResponse.json(LOCATIONS)));
    const { user } = renderApp("/locations", ADMIN);
    await screen.findByRole("list", { name: "Location tree" });

    await user.type(screen.getByRole("searchbox", { name: "Search locations" }), "paris");

    expect(screen.getByText("Nothing matches “paris”")).toBeInTheDocument();
  });

  it("opens the creation panel for a child location with the parent preselected", async () => {
    server.use(http.get("*/api/locations", () => HttpResponse.json(LOCATIONS)));
    const { user } = renderApp("/locations", ADMIN);
    await screen.findByRole("list", { name: "Location tree" });

    await user.click(screen.getByRole("button", { name: "Add location inside Berlin" }));

    const panel = screen.getByRole("dialog", { name: "New location" });
    expect(within(panel).getByRole("combobox", { name: "Level" })).toHaveTextContent("Building");
    expect(await within(panel).findByRole("combobox", { name: "Parent location" })).toHaveTextContent("Germany / Berlin");
  });

  it("renames a location and shows the new name", async () => {
    let body: unknown = null;
    let current = LOCATIONS;
    server.use(
      http.get("*/api/locations", () => HttpResponse.json(current)),
      http.patch("*/api/locations/:id", async ({ request }) => {
        body = await request.json();
        current = LOCATIONS.map((location) => (location.id === "d" ? { ...location, name: "München" } : location));
        return HttpResponse.json({ ...LOCATIONS[3], name: "München" });
      }),
    );
    const { user } = renderApp("/locations", ADMIN);

    await user.click(await screen.findByRole("button", { name: "Rename Munich" }));
    const panel = screen.getByRole("dialog", { name: "Rename location" });
    const name = within(panel).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "München");
    await user.click(within(panel).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Renamed to München")).toBeInTheDocument();
    expect(body).toEqual({ name: "München" });
    expect(within(screen.getByRole("list", { name: "Location tree" })).getByText("München")).toBeInTheDocument();
  });

  it("shows why a location cannot be deleted and keeps it", async () => {
    server.use(
      http.get("*/api/locations", () => HttpResponse.json(LOCATIONS)),
      http.delete("*/api/locations/:id", () =>
        HttpResponse.json({ error: "Delete or move the nested locations first" }, { status: 409 }),
      ),
    );
    const { user } = renderApp("/locations", ADMIN);

    await user.click(await screen.findByRole("button", { name: "Delete Berlin" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete “Berlin”?" });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Delete or move the nested locations first");
    expect(screen.getByText("Berlin HQ")).toBeInTheDocument();
  });

  it("deletes an unused location", async () => {
    let deleted: string | null = null;
    let current = LOCATIONS;
    server.use(
      http.get("*/api/locations", () => HttpResponse.json(current)),
      http.delete("*/api/locations/:id", ({ params }) => {
        deleted = String(params.id);
        current = LOCATIONS.filter((location) => location.id !== "d");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = renderApp("/locations", ADMIN);

    await user.click(await screen.findByRole("button", { name: "Delete Munich" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));

    expect(await screen.findByText("Munich deleted")).toBeInTheDocument();
    expect(deleted).toBe("d");
    expect(within(screen.getByRole("list", { name: "Location tree" })).queryByText("Munich")).not.toBeInTheDocument();
  });

  it("offers no editing to managers", async () => {
    server.use(http.get("*/api/locations", () => HttpResponse.json(LOCATIONS)));
    renderApp("/locations", MANAGER);

    await screen.findByRole("list", { name: "Location tree" });

    expect(screen.queryByRole("button", { name: /^Rename|^Delete/ })).not.toBeInTheDocument();
  });
});

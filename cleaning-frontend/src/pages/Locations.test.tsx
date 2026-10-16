import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";

import { ADMIN, makeLocation } from "../test/fixtures";
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
});

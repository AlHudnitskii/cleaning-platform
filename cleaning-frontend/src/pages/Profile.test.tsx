import { screen } from "@testing-library/react";

import { CLEANER } from "../test/fixtures";
import { chooseOption, renderApp } from "../test/render";
import { setTheme } from "../theme";

describe("Profile page", () => {
  afterEach(() => setTheme("light"));

  it("switches the theme where the top bar has no room for the switch", async () => {
    const { user } = renderApp("/profile", CLEANER);
    await screen.findByRole("heading", { name: "Profile" });

    await chooseOption(user, "Theme", "Dark theme");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveTextContent("Dark theme");
  });
});

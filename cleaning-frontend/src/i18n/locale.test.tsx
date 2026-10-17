import { screen } from "@testing-library/react";

import { renderApp } from "../test/render";
import { setLocale, t } from "./locale";

describe("language", () => {
  it("switches the login page to Russian and remembers the choice", async () => {
    const { user } = renderApp("/login");

    await user.click(screen.getByRole("radio", { name: "Русский" }));

    expect(await screen.findByRole("heading", { name: "Вход" })).toBeInTheDocument();
    expect(screen.getByLabelText("Электронная почта")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Русский" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Русский" })).toHaveFocus();
    expect(document.documentElement.lang).toBe("ru");
    expect(localStorage.getItem("cleaning-locale")).toBe("ru");
  });

  it("moves between languages with the arrow keys", async () => {
    const { user } = renderApp("/login");

    screen.getByRole("radio", { name: "English" }).focus();
    await user.keyboard("{ArrowRight}");

    expect(await screen.findByRole("heading", { name: "Вход" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Русский" })).toHaveFocus();
  });

  it.each([
    [1, "Просрочено на 1 день"],
    [2, "Просрочено на 2 дня"],
    [5, "Просрочено на 5 дней"],
    [11, "Просрочено на 11 дней"],
    [21, "Просрочено на 21 день"],
    [24, "Просрочено на 24 дня"],
  ])("uses the Russian plural form for %i days", (days, expected) => {
    setLocale("ru");
    expect(t().workflow.overdueBy(days)).toBe(expected);
  });
});

import { render, screen } from "@testing-library/react";

import { PageErrorBoundary } from "./ErrorBoundary";

function Broken(): never {
  throw new Error("review_blockers is undefined");
}

describe("PageErrorBoundary", () => {
  it("replaces a crashed page with a way to recover", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <PageErrorBoundary>
        <Broken />
      </PageErrorBoundary>,
    );

    expect(screen.getByRole("heading", { name: "This page could not be shown" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to start page" })).toHaveAttribute("href", "/");
    spy.mockRestore();
  });
});

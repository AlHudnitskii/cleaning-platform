import { emailName, formatRelative } from "./labels";

const NOW = Date.parse("2026-10-15T12:00:00Z");

describe("formatRelative", () => {
  it.each([
    ["2026-10-15T11:59:30Z", "Just now"],
    ["2026-10-15T11:45:00Z", "15 minutes ago"],
    ["2026-10-15T09:00:00Z", "3 hours ago"],
    ["2026-10-14T10:00:00Z", "Yesterday"],
    ["2026-10-12T12:00:00Z", "3 days ago"],
  ])("describes %s as %s", (value, expected) => {
    expect(formatRelative(value, NOW)).toBe(expected);
  });

  it("falls back to the date for anything older than a week or in the future", () => {
    expect(formatRelative("2026-10-01T12:00:00Z", NOW)).toBe("1 Oct 2026");
    expect(formatRelative("2026-10-16T12:00:00Z", NOW)).toBe("16 Oct 2026");
  });
});

describe("emailName", () => {
  it("keeps the part before the at sign", () => {
    expect(emailName("cleaner1@cleaning.com")).toBe("cleaner1");
  });
});

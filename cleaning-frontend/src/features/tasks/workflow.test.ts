import { makeTask } from "../../test/fixtures";
import { actionLabel, nextStep } from "./workflow";

describe("actionLabel", () => {
  it.each([
    ["pending", "in_progress", "Start work"],
    ["on_hold", "in_progress", "Resume"],
    ["on_review", "in_progress", "Return for rework"],
    ["completed", "in_progress", "Reopen"],
    ["cancelled", "in_progress", "Reopen"],
    ["on_review", "completed", "Approve"],
  ] as const)("names the move from %s to %s as %s", (from, to, label) => {
    expect(actionLabel(from, to)).toBe(label);
  });
});

describe("nextStep", () => {
  it("returns the forward step only when the server allows it", () => {
    expect(nextStep(makeTask({ status: "pending", allowed_statuses: ["in_progress", "cancelled"] }))).toBe("in_progress");
    expect(nextStep(makeTask({ status: "on_review", allowed_statuses: ["in_progress"] }))).toBeNull();
    expect(nextStep(makeTask({ status: "completed", allowed_statuses: ["in_progress"] }))).toBeNull();
  });
});

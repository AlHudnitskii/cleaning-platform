import { makeTask } from "../../test/fixtures";
import { actionLabel, dueLabel, dueState, nextStep } from "./workflow";

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

describe("dueState", () => {
  const TODAY = "2026-10-16";

  it.each([
    ["2026-10-15", "pending", "overdue"],
    ["2026-10-16", "in_progress", "today"],
    ["2026-10-18", "pending", "soon"],
    ["2026-10-30", "pending", "later"],
  ] as const)("classifies a task due %s in status %s as %s", (due, status, state) => {
    expect(dueState({ due_date: due, status }, TODAY)).toBe(state);
  });

  it("never marks closed or undated tasks as overdue", () => {
    expect(dueState({ due_date: "2026-10-01", status: "completed" }, TODAY)).toBeNull();
    expect(dueState({ due_date: "2026-10-01", status: "cancelled" }, TODAY)).toBeNull();
    expect(dueState({ due_date: null, status: "pending" }, TODAY)).toBeNull();
  });

  it("describes the due date in words", () => {
    expect(dueLabel("2026-10-15", "overdue", TODAY)).toBe("Overdue by 1 day");
    expect(dueLabel("2026-10-13", "overdue", TODAY)).toBe("Overdue by 3 days");
    expect(dueLabel("2026-10-16", "today", TODAY)).toBe("Due today");
    expect(dueLabel("2026-10-17", "soon", TODAY)).toBe("Due tomorrow");
    expect(dueLabel("2026-10-30", "later", TODAY)).toBe("Due 30 Oct 2026");
  });
});

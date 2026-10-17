import type { LocationResponse } from "../../api/types";
import { buildTree, filterTree } from "./api";

function location(id: string, name: string, parentId: string | null): LocationResponse {
  return {
    id,
    name,
    country: "DE",
    level: parentId ? "city" : "country",
    parent_id: parentId,
    path: id,
    full_name: name,
    created_at: "2026-01-01T00:00:00Z",
  };
}

describe("buildTree", () => {
  it("nests children under parents and sorts siblings by name", () => {
    const tree = buildTree([
      location("munich", "Munich", "germany"),
      location("germany", "Germany", null),
      location("berlin", "Berlin", "germany"),
    ]);

    expect(tree.map((n) => n.name)).toEqual(["Germany"]);
    expect(tree[0]?.children.map((n) => n.name)).toEqual(["Berlin", "Munich"]);
  });

  it("treats locations whose parent is outside the list as roots", () => {
    const tree = buildTree([location("floor", "Floor 1", "hidden-building")]);

    expect(tree.map((n) => n.name)).toEqual(["Floor 1"]);
  });
});

describe("filterTree", () => {
  const tree = buildTree([
    location("germany", "Germany", null),
    location("berlin", "Berlin", "germany"),
    location("hq", "Berlin HQ", "berlin"),
    location("munich", "Munich", "germany"),
  ]);

  it("keeps matches together with their ancestors, case-insensitively", () => {
    const result = filterTree(tree, "hq");

    expect(result.map((n) => n.name)).toEqual(["Germany"]);
    expect(result[0]?.children.map((n) => n.name)).toEqual(["Berlin"]);
    expect(result[0]?.children[0]?.children.map((n) => n.name)).toEqual(["Berlin HQ"]);
  });

  it("returns nothing when no location matches", () => {
    expect(filterTree(tree, "paris")).toEqual([]);
  });

  it("returns the tree unchanged for an empty query", () => {
    expect(filterTree(tree, "  ")).toBe(tree);
  });
});

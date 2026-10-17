import { makeUser } from "../test/fixtures";
import { loadProfile, PROFILE_KEY } from "./session";

describe("Stored profile", () => {
  it("fills the fields that a profile saved by the previous version lacks", () => {
    const legacy: Record<string, unknown> = { ...makeUser({ role: "cleaner" }) };
    delete legacy.full_name;
    delete legacy.phone;
    delete legacy.avatar_url;
    localStorage.setItem(PROFILE_KEY, JSON.stringify(legacy));

    expect(loadProfile()).toMatchObject({ email: legacy.email, full_name: null, phone: null, avatar_url: null });
  });

  it("ignores a stored value that is not a profile", () => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ email: 42 }));

    expect(loadProfile()).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { isActivePath } from "./navigation";

describe("isActivePath", () => {
  it("matches the route itself and nested routes", () => {
    expect(isActivePath("/brds", "/brds")).toBe(true);
    expect(isActivePath("/brds/abc123", "/brds")).toBe(true);
  });

  it("does not match routes that merely share a prefix", () => {
    expect(isActivePath("/brds-archive", "/brds")).toBe(false);
    expect(isActivePath("/settings", "/brds")).toBe(false);
  });
});

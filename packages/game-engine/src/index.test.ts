import { describe, expect, it } from "vitest";
import { GAME_ENGINE_PACKAGE_READY } from "./index.js";

describe("game-engine scaffold", () => {
  it("is wired up and testable", () => {
    expect(GAME_ENGINE_PACKAGE_READY).toBe(true);
  });
});

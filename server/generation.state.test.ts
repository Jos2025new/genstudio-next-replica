import { describe, expect, it } from "vitest";
import { generationReducer } from "../client/src/lib/generationState";

describe("generation state", () => {
  it("transitions through loading, success, error, and reset", () => {
    const loading = generationReducer({ status: "idle" }, { type: "start" });
    expect(loading).toEqual({ status: "loading" });
    expect(generationReducer(loading, { type: "success", count: 2 })).toEqual({ status: "success", count: 2 });
    expect(generationReducer(loading, { type: "error", message: "rate limit" })).toEqual({ status: "error", message: "rate limit" });
    expect(generationReducer(loading, { type: "reset" })).toEqual({ status: "idle" });
  });
});

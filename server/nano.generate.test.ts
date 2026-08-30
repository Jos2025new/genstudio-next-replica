import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = { req: {} as TrpcContext["req"], res: {} as TrpcContext["res"], user: null } as TrpcContext;

describe("nano integration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("validates a key through the authenticated balance endpoint", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ usd_balance: "1.25" }), { status: 200 }));
    const result = await appRouter.createCaller(ctx).nano.validateKey({ apiKey: "ngpt_test_valid_key" });
    expect(result).toEqual({ valid: true });
    expect(fetchMock).toHaveBeenCalledWith("https://nano-gpt.com/api/check-balance", expect.objectContaining({ method: "POST", headers: { "x-api-key": "ngpt_test_valid_key" } }));
  });

  it("passes composition references and returns NanoGPT output", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: [{ url: "https://cdn.example/result.png" }] }), { status: 200 }));
    const result = await appRouter.createCaller(ctx).nano.generate({ apiKey: "ngpt_test_valid_key", model: "flux-kontext", prompt: "A refined editorial portrait", n: 1, size: "1024x1024", imageDataUrls: ["data:image/png;base64,abc"] });
    expect(result).toEqual({ data: [{ url: "https://cdn.example/result.png" }] });
    expect(fetchMock).toHaveBeenCalledWith("https://nano-gpt.com/v1/images/generations", expect.objectContaining({ method: "POST" }));
    const request = fetchMock.mock.calls[0]?.[1];
    expect(String(request?.body)).toContain("imageDataUrls");
  });
});

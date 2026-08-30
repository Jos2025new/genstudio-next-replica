import { afterEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ctx = { req: {} as TrpcContext["req"], res: {} as TrpcContext["res"], user: null } as TrpcContext;

describe("nano i2v", () => {
  afterEach(() => vi.restoreAllMocks());

  it("submits an image-to-video job with the reference image", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ runId: "vid_test_123", status: "pending" }), { status: 200 }));
    const result = await appRouter.createCaller(ctx).nano.videoGenerate({ apiKey: "ngpt_test_valid_key", model: "veo2-video", prompt: "Slow camera push in", imageDataUrl: "data:image/png;base64,abc", duration: "5", aspect_ratio: "16:9", resolution: "720p" });
    expect(result).toEqual({ runId: "vid_test_123", status: "pending" });
    expect(fetchMock).toHaveBeenCalledWith("https://nano-gpt.com/api/generate-video", expect.objectContaining({ method: "POST" }));
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('"mode":"image-to-video"');
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain('"imageDataUrl":"data:image/png;base64,abc"');
  });

  it("polls unified video status using the returned run id", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { status: "COMPLETED", output: { video: { url: "https://cdn.example/video.mp4" } } } }), { status: 200 }));
    const result = await appRouter.createCaller(ctx).nano.videoStatus({ apiKey: "ngpt_test_valid_key", runId: "vid_test_123", model: "veo2-video" });
    expect(result).toEqual({ data: { status: "COMPLETED", output: { video: { url: "https://cdn.example/video.mp4" } } } });
    expect(fetchMock).toHaveBeenCalledWith("https://nano-gpt.com/api/video/status?runId=vid_test_123&model=veo2-video", expect.objectContaining({ headers: { "x-api-key": "ngpt_test_valid_key" } }));
  });
});

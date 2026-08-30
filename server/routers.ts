import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

const nanoModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
  supported_parameters: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const videoRequestSchema = z.object({
  apiKey: z.string().min(8),
  model: z.string().min(1),
  prompt: z.string().min(3),
  imageDataUrl: z.string().startsWith("data:image/"),
  duration: z.string().optional(),
  seconds: z.string().optional(),
  aspect_ratio: z.string().optional(),
  resolution: z.string().optional(),
  seed: z.number().int().optional(),
});

const videoStatusSchema = z.object({ apiKey: z.string().min(8), runId: z.string().min(1), model: z.string().min(1) });

const imageRequestSchema = z.object({
  apiKey: z.string().min(8, "Introduce una API Key válida."),
  model: z.string().min(1),
  prompt: z.string().min(3, "Escribe un prompt más descriptivo."),
  n: z.number().int().min(1).max(4),
  size: z.string().min(1),
  quality: z.string().optional(),
  strength: z.number().min(0).max(1).optional(),
  guidance_scale: z.number().min(0).max(20).optional(),
  seed: z.number().int().optional(),
  imageDataUrls: z.array(z.string().startsWith("data:image/")).max(4).optional(),
});

async function nanoFetch(path: string, init?: RequestInit) {
  const response = await fetch(`https://nano-gpt.com${path}`, init);
  const text = await response.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = { error: { message: text || "Respuesta no válida de NanoGPT." } }; }
  if (!response.ok) {
    const message = typeof data === "object" && data && "error" in data && typeof data.error === "object" && data.error && "message" in data.error ? String(data.error.message) : `NanoGPT respondió con ${response.status}.`;
    throw new Error(message);
  }
  return data;
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  nano: router({
    models: publicProcedure.query(async () => {
      const data = await nanoFetch("/api/v1/image-models?detailed=true");
      const parsed = z.object({ data: z.array(nanoModelSchema) }).safeParse(data);
      if (!parsed.success) return [];
      return parsed.data.data.filter((model) => model.capabilities?.image_generation !== false);
    }),
    videoModels: publicProcedure.query(async () => {
      const data = await nanoFetch("/api/v1/video-models?detailed=true");
      const parsed = z.object({ data: z.array(nanoModelSchema) }).safeParse(data);
      if (!parsed.success) return [];
      return parsed.data.data.filter((model) => model.capabilities?.video_generation !== false);
    }),
    validateKey: publicProcedure.input(z.object({ apiKey: z.string().min(8) })).mutation(async ({ input }) => {
      await nanoFetch("/api/check-balance", { method: "POST", headers: { "x-api-key": input.apiKey } });
      return { valid: true } as const;
    }),
    videoGenerate: publicProcedure.input(videoRequestSchema).mutation(async ({ input }) => {
      const body: Record<string, unknown> = { model: input.model, prompt: input.prompt, imageDataUrl: input.imageDataUrl, mode: "image-to-video" };
      for (const key of ["duration", "seconds", "aspect_ratio", "resolution"] as const) if (input[key] !== undefined) body[key] = input[key];
      if (input.seed !== undefined) body.seed = input.seed;
      return nanoFetch("/api/generate-video", { method: "POST", headers: { "x-api-key": input.apiKey, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }),
    videoStatus: publicProcedure.input(videoStatusSchema).query(async ({ input }) => {
      return nanoFetch(`/api/video/status?runId=${encodeURIComponent(input.runId)}&model=${encodeURIComponent(input.model)}`, { headers: { "x-api-key": input.apiKey } });
    }),
    generate: publicProcedure.input(imageRequestSchema).mutation(async ({ input }) => {
      const body: Record<string, unknown> = {
        model: input.model,
        prompt: input.prompt,
        n: input.n,
        size: input.size,
        response_format: "url",
      };
      if (input.quality) body.quality = input.quality;
      if (input.strength !== undefined) body.strength = input.strength;
      if (input.guidance_scale !== undefined) body.guidance_scale = input.guidance_scale;
      if (input.seed !== undefined) body.seed = input.seed;
      if (input.imageDataUrls?.length) body.imageDataUrls = input.imageDataUrls;
      return nanoFetch("/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }),
  }),
});

export type AppRouter = typeof appRouter;

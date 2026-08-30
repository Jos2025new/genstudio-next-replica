# NanoGPT i2v findings

- The official video generation endpoint is `POST https://nano-gpt.com/api/generate-video`.
- Image-conditioned models accept `imageDataUrl` (base64 data URL) or a public `imageUrl`.
- The request is asynchronous and returns `runId`, `id`, `model`, and `status: "pending"`.
- The unified video status endpoint is listed as `GET /api/v1/video/status` in the official documentation navigation; poll with the job identifier until the final video asset is available.
- Common model-dependent fields include `duration`, `seconds`, `aspect_ratio`, `orientation`, `resolution`, `size`, `mode`, and `seed`; clients should only expose fields supported by the selected model catalog entry.
- Video model discovery is `GET https://nano-gpt.com/api/v1/video-models?detailed=true`; filter for `capabilities.image_to_video === true` when building the i2v chooser.
- Errors return a descriptive JSON payload; surface `error.message` and HTTP status to the UI.

Sources:
- https://docs.nano-gpt.com/api-reference/endpoint/video-generation
- https://docs.nano-gpt.com/api-reference/endpoint/video-models

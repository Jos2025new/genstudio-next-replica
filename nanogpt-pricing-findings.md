# NanoGPT pricing findings

The official Image Models documentation confirms that model discovery returns model-specific `supported_parameters` such as `resolutions` and `max_images`, but the extracted page does not guarantee a single universal price field for all models. Therefore the UI must read price metadata only when present and otherwise show `Precio no disponible` rather than inventing a value.

For video jobs, the submit response/status response can expose a job-level `cost` field. The UI should display the exact returned cost after submission/completion. Before submission, it may show an estimate only if the selected model catalog exposes an explicit numeric price or price table.

Sources:
- https://docs.nano-gpt.com/api-reference/endpoint/image-models
- https://docs.nano-gpt.com/api-reference/endpoint/video-generation
- https://docs.nano-gpt.com/api-reference/endpoint/video-status

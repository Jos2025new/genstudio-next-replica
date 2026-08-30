export type GenerationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; count: number }
  | { status: "error"; message: string };

export type GenerationEvent =
  | { type: "start" }
  | { type: "success"; count: number }
  | { type: "error"; message: string }
  | { type: "reset" };

export function generationReducer(state: GenerationState, event: GenerationEvent): GenerationState {
  switch (event.type) {
    case "start": return { status: "loading" };
    case "success": return { status: "success", count: event.count };
    case "error": return { status: "error", message: event.message };
    case "reset": return { status: "idle" };
  }
}

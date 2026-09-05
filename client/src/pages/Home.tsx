import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { generationReducer } from "@/lib/generationState";
import { toast } from "sonner";
import {
  AlertCircle, ChevronDown, ChevronRight, CircleHelp, Download, ImagePlus, KeyRound,
  Loader2, Menu, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, ShieldCheck,
  Sparkles, Trash2, Video, X, Zap,
} from "lucide-react";

type GalleryItem = { id: string; url: string; prompt: string; model: string; createdAt: number; kind?: "image" | "video"; cost?: number };

type VideoJob = { id: string; runId: string; model: string; prompt: string; status: string; reference: string; error?: string; url?: string; cost?: number };

type CatalogModel = { id: string; name?: string; description?: string; capabilities?: Record<string, unknown>; supported_parameters?: Record<string, any>; pricing?: Record<string, any>; price?: number; cost?: number };

type PresetKey = "turnaround" | "poses" | "perspective" | "sheet";
type StudioPreset = { key: PresetKey; name: string; description: string; variants: { id: string; name: string; detail: string }[] };

const studioPresets: StudioPreset[] = [
  { key: "turnaround", name: "Character Turnaround", description: "Keep identity consistent across views.", variants: [
    { id: "front", name: "Front view", detail: "Centered · neutral" }, { id: "three-quarter", name: "Three-quarter view", detail: "45° · neutral" }, { id: "left-side", name: "Left side view", detail: "Profile · neutral" }, { id: "back", name: "Back view", detail: "Centered · rear" },
  ] },
  { key: "poses", name: "Poses", description: "Explore a consistent pose range.", variants: [
    { id: "neutral", name: "Neutral standing", detail: "Grounded · full body" }, { id: "walking", name: "Walking", detail: "Mid-step · full body" }, { id: "dynamic", name: "Dynamic", detail: "Action · full body" }, { id: "seated", name: "Seated", detail: "Resting · full body" },
  ] },
  { key: "perspective", name: "Perspectives", description: "Frame the same subject with intent.", variants: [
    { id: "eye-level", name: "Eye level", detail: "50mm · balanced" }, { id: "low-angle", name: "Low angle", detail: "24mm · heroic" }, { id: "high-angle", name: "High angle", detail: "35mm · top-down" }, { id: "side-perspective", name: "Side perspective", detail: "50mm · profile" },
  ] },
  { key: "sheet", name: "Character Sheet", description: "Create a production-ready reference board.", variants: [
    { id: "clean-sheet", name: "Clean sheet", detail: "4 views · labels" }, { id: "expression-sheet", name: "Expression sheet", detail: "6 expressions" }, { id: "detail-sheet", name: "Detail sheet", detail: "Material · close-ups" }, { id: "full-sheet", name: "Full reference", detail: "Views · poses · notes" },
  ] },
];

function maskKey(key: string) { return key ? `${key.slice(0, 5)}${"•".repeat(Math.max(5, Math.min(12, key.length - 5)))}${key.slice(-4)}` : ""; }
function getImageUrl(item: any): string | undefined { return item?.url || (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : undefined); }
function hasCapability(model: CatalogModel | undefined, key: string) { return Boolean(model?.capabilities?.[key]); }
function supports(model: CatalogModel | undefined, key: string) { return Boolean(model?.supported_parameters?.[key]); }
function lookupPrice(value: unknown, keys: string[]) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) if (typeof record[key] === "number" && Number.isFinite(record[key] as number)) return record[key] as number;
  return undefined;
}
function modelPrice(model: CatalogModel | undefined, kind: "image" | "video", variant?: { size?: string; duration?: string; resolution?: string }) {
  const pricing = model?.pricing || {};
  if (kind === "image") {
    const raw = pricing.per_image ?? pricing.image ?? pricing.image_generation;
    const size = variant?.size || "";
    const normalized = size.replace("x", "*");
    return lookupPrice(raw, [size, normalized, "default"]) ?? lookupPrice(model?.price ?? model?.cost, ["default"]);
  }
  const duration = variant?.duration || "";
  const raw = pricing.per_video ?? pricing.video ?? pricing.clip ?? pricing.per_clip;
  const direct = lookupPrice(raw, [duration, `${duration}s`, variant?.resolution || "", "default"]);
  if (direct !== undefined) return direct;
  const perSecond = lookupPrice(pricing.per_second, [variant?.resolution || "", "default"]);
  if (perSecond !== undefined && Number(duration)) return perSecond * Number(duration);
  return lookupPrice(model?.price ?? model?.cost, ["default"]);
}
function formatCost(value: number | undefined) { return value === undefined ? "Precio no disponible" : `$${value.toFixed(value < 0.1 ? 3 : 2)}`; }
function parameterOptions(model: CatalogModel | undefined, keys: string[], fallback: string[]) {
  for (const key of keys) {
    const value = model?.supported_parameters?.[key];
    if (Array.isArray(value)) return value.map(String);
    if (value && typeof value === "object" && Array.isArray((value as { values?: unknown[] }).values)) return (value as { values: unknown[] }).values.map(String);
  }
  return fallback;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"generate" | "compose">("generate");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [modelId, setModelId] = useState("");
  const [modelKind, setModelKind] = useState<"image" | "video">("image");
  const [videoBatchSize, setVideoBatchSize] = useState(1);
  const [videoDuration, setVideoDuration] = useState("5");
  const [videoAspect, setVideoAspect] = useState("16:9");
  const [videoResolution, setVideoResolution] = useState("720p");
  const [videoJobs, setVideoJobs] = useState<VideoJob[]>([]);
  const [prompt, setPrompt] = useState("");
  const [presetKey, setPresetKey] = useState<PresetKey>("turnaround");
  const [presetVariant, setPresetVariant] = useState("front");
  const [jsonOpen, setJsonOpen] = useState(false);
  const [jsonValue, setJsonValue] = useState("");
  const [jsonCopied, setJsonCopied] = useState(false);
  const [size, setSize] = useState("1024x1024");
  const [count, setCount] = useState(1);
  const [quality, setQuality] = useState("medium");
  const [references, setReferences] = useState<string[]>([]);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [generationState, dispatchGeneration] = useReducer(generationReducer, { status: "idle" });
  const loading = generationState.status === "loading";
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [keyStatus, setKeyStatus] = useState<"idle" | "checking" | "valid" | "invalid">("idle");
  const fileRef = useRef<HTMLInputElement>(null);

  const imageModelsQuery = trpc.nano.models.useQuery(undefined, { staleTime: 1000 * 60 * 10, retry: 1 });
  const videoModelsQuery = trpc.nano.videoModels.useQuery(undefined, { staleTime: 1000 * 60 * 10, retry: 1 });
  const validateKey = trpc.nano.validateKey.useMutation();
  const videoGenerateMutation = trpc.nano.videoGenerate.useMutation();
  const trpcUtils = trpc.useUtils();
  const imageModels = (imageModelsQuery.data || []) as CatalogModel[];
  const videoModels = useMemo(() => ((videoModelsQuery.data || []) as CatalogModel[]).filter(model => hasCapability(model, "image_to_video")), [videoModelsQuery.data]);
  const allModels = useMemo(() => [...imageModels, ...videoModels], [imageModels, videoModels]);
  const selectedModel = useMemo(() => allModels.find(m => m.id === modelId), [allModels, modelId]);
  const resolutions = ((selectedModel?.supported_parameters?.resolutions || selectedModel?.supported_parameters?.resolution?.values || ["1024x1024"]) as string[]);
  const videoResolutions = parameterOptions(selectedModel, ["resolutions", "resolution"], ["480p", "720p", "1080p"]);
  const videoDurations = parameterOptions(selectedModel, ["durations", "duration", "seconds"], ["5", "8", "10"]);
  const videoAspects = parameterOptions(selectedModel, ["aspect_ratios", "aspect_ratio"], ["16:9", "9:16", "1:1"]);
  const videoBatchMax = Math.min(4, Number(selectedModel?.supported_parameters?.max_batch_size || selectedModel?.supported_parameters?.max_images || 4));
  const videoDurationKey = selectedModel?.supported_parameters?.seconds ? "seconds" : "duration";
  const supportsQuality = supports(selectedModel, "quality");
  const unitCost = modelPrice(selectedModel, modelKind, modelKind === "image" ? { size } : { duration: videoDuration, resolution: videoResolution });
  const estimatedCost = unitCost === undefined ? undefined : unitCost * (modelKind === "video" ? videoBatchSize : count);
  const costLabel = formatCost(estimatedCost);
  const filteredImages = useMemo(() => imageModels.filter(m => `${m.name || ""} ${m.id} ${m.description || ""}`.toLowerCase().includes(modelSearch.toLowerCase())), [imageModels, modelSearch]);
  const filteredVideos = useMemo(() => videoModels.filter(m => `${m.name || ""} ${m.id} ${m.description || ""}`.toLowerCase().includes(modelSearch.toLowerCase())), [videoModels, modelSearch]);
  const selectedPreset = useMemo(() => studioPresets.find(item => item.key === presetKey) || studioPresets[0], [presetKey]);
  const selectedVariant = useMemo(() => selectedPreset.variants.find(item => item.id === presetVariant) || selectedPreset.variants[0], [presetVariant, selectedPreset]);
  const modelsLoading = imageModelsQuery.isLoading || videoModelsQuery.isLoading;
  const modelsError = imageModelsQuery.isError && videoModelsQuery.isError;

  useEffect(() => {
    const savedKey = sessionStorage.getItem("nanogpt_api_key") || "";
    setApiKey(savedKey); setKeyDraft(savedKey); setKeyStatus(savedKey ? "valid" : "idle");
    setGallery(JSON.parse(sessionStorage.getItem("genstudio_gallery") || "[]"));
    setHistory(JSON.parse(sessionStorage.getItem("genstudio_history") || "[]"));
  }, []);
  useEffect(() => {
    if (!modelId && imageModels[0]) { setModelId(imageModels[0].id); setModelKind("image"); }
  }, [imageModels, modelId]);
  useEffect(() => {
    if (selectedModel && !resolutions.includes(size)) setSize(resolutions[0]);
    if (selectedModel && !supportsQuality) setQuality("medium");
    if (selectedModel && !videoDurations.includes(videoDuration)) setVideoDuration(videoDurations[0]);
    if (selectedModel && !videoAspects.includes(videoAspect)) setVideoAspect(videoAspects[0]);
    if (selectedModel && videoBatchSize > videoBatchMax) setVideoBatchSize(videoBatchMax);
    if (selectedModel && !videoResolutions.includes(videoResolution)) setVideoResolution(videoResolutions[0]);
  }, [selectedModel, resolutions, size, supportsQuality, videoDurations, videoDuration, videoAspects, videoAspect, videoBatchMax, videoBatchSize, videoResolutions, videoResolution]);

  const saveKey = async () => {
    if (!keyDraft.trim()) { sessionStorage.removeItem("nanogpt_api_key"); setApiKey(""); setKeyStatus("idle"); toast.success("API Key eliminada"); return; }
    setKeyStatus("checking");
    try {
      await validateKey.mutateAsync({ apiKey: keyDraft.trim() });
      sessionStorage.setItem("nanogpt_api_key", keyDraft.trim()); setApiKey(keyDraft.trim()); setKeyStatus("valid");
      toast.success("API Key validada y guardada en esta sesión");
    } catch { setKeyStatus("invalid"); toast.error("No se pudo validar la API Key. Revisa el valor e inténtalo de nuevo."); }
  };
  const removeKey = () => { sessionStorage.removeItem("nanogpt_api_key"); setApiKey(""); setKeyDraft(""); setKeyStatus("idle"); toast.success("API Key eliminada"); };
  const addFiles = (files: FileList | null) => {
    if (!files) return;
    if (references.length >= 4) { toast.error("Solo puedes añadir hasta 4 referencias."); return; }
    Array.from(files).slice(0, 4 - references.length).forEach(file => {
      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error(`${file.name}: usa PNG, JPEG o WebP.`); return; }
      if (file.size > 4 * 1024 * 1024) { toast.error(`${file.name}: el tamaño máximo es 4 MB.`); return; }
      const reader = new FileReader(); reader.onload = () => setReferences(r => [...r, String(reader.result)]); reader.readAsDataURL(file);
    });
  };
  const choosePreset = (key: PresetKey) => {
    const preset = studioPresets.find(item => item.key === key) || studioPresets[0];
    setPresetKey(key);
    setPresetVariant(preset.variants[0].id);
    setPrompt(current => current.trim() ? current : `${preset.name}: ${preset.variants[0].name}. `);
  };
  const buildStudioJob = () => ({
    provider: "NanoGPT",
    model: selectedModel?.id || modelId || null,
    preset: selectedPreset.name,
    variant: selectedVariant.name,
    prompt,
    referenceCount: references.length,
    outputs: count,
    size,
    quality: supportsQuality ? quality : undefined,
    mode: activeTab === "compose" ? "compose" : "generate",
  });
  const openJsonJob = () => { setJsonValue(JSON.stringify(buildStudioJob(), null, 2)); setJsonOpen(true); };
  const copyJsonJob = async () => { await navigator.clipboard?.writeText(jsonValue); setJsonCopied(true); window.setTimeout(() => setJsonCopied(false), 1400); };

  const generateMutation = trpc.nano.generate.useMutation({
    onSuccess: (result: any) => {
      const data = Array.isArray(result?.data) ? result.data : [];
      const items = data.map((item: any, index: number) => ({ id: `${Date.now()}-${index}`, url: getImageUrl(item), prompt, model: selectedModel?.name || modelId, createdAt: Date.now(), kind: "image" as const, cost: typeof item?.cost === "number" ? item.cost : undefined })).filter((item: GalleryItem) => item.url);
      if (!items.length) setError("NanoGPT no devolvió imágenes. Revisa el modelo o los parámetros.");
      else { const next = [...items, ...gallery].slice(0, 24); setGallery(next); sessionStorage.setItem("genstudio_gallery", JSON.stringify(next)); toast.success(`${items.length} resultado${items.length === 1 ? "" : "s"} listo${items.length === 1 ? "" : "s"}`); }
      dispatchGeneration({ type: "success", count: items.length });
    },
    onError: (err) => { const message = err.message || "La generación falló. Intenta de nuevo."; setError(message); dispatchGeneration({ type: "error", message }); },
  });
  const submitGeneration = () => {
    if (!apiKey) { setSettingsOpen(true); toast.error("Configura tu API Key de NanoGPT para continuar."); return; }
    if (!prompt.trim()) { setError("Añade una instrucción para crear tu imagen."); return; }
    if (!modelId) { setError("Selecciona un modelo antes de generar."); return; }
    if (modelKind === "video") { void submitVideoBatch(); return; }
    if (activeTab === "compose" && !hasCapability(selectedModel, "image_to_image")) { setError("El modelo seleccionado no admite composición con imágenes de referencia."); return; }
    const nextHistory = [prompt, ...history.filter(p => p !== prompt)].slice(0, 12);
    setHistory(nextHistory); sessionStorage.setItem("genstudio_history", JSON.stringify(nextHistory)); setError(""); dispatchGeneration({ type: "start" });
    generateMutation.mutate({ apiKey, model: modelId, prompt, n: count, size, quality: supportsQuality ? quality : undefined, imageDataUrls: activeTab === "compose" && references.length ? references : undefined });
  };
  const chooseModel = (model: CatalogModel, kind: "image" | "video") => { setModelId(model.id); setModelKind(kind); setModelPickerOpen(false); setModelSearch(""); };
  const retryModels = () => { void imageModelsQuery.refetch(); void videoModelsQuery.refetch(); };

  useEffect(() => {
    const pending = videoJobs.filter(job => !["COMPLETED", "FAILED", "CANCELED"].includes(job.status));
    if (!pending.length || !apiKey) return;
    const timer = window.setInterval(async () => {
      await Promise.all(pending.map(async job => {
        try {
          const result: any = await trpcUtils.nano.videoStatus.fetch({ apiKey, runId: job.runId, model: job.model });
          const status = String(result?.data?.status || result?.status || "IN_PROGRESS").toUpperCase();
          const url = result?.data?.output?.video?.url || result?.output?.video?.url;
          const cost = typeof result?.data?.cost === "number" ? result.data.cost : typeof result?.cost === "number" ? result.cost : job.cost;
          setVideoJobs(current => current.map(item => item.id === job.id ? { ...item, status, url: url || item.url, cost } : item));
          if (url) {
            const galleryItem: GalleryItem = { id: job.id, url, prompt: job.prompt, model: job.model, createdAt: Date.now(), kind: "video", cost };
            setGallery(current => { const next = [galleryItem, ...current.filter(item => item.id !== job.id)].slice(0, 24); sessionStorage.setItem("genstudio_gallery", JSON.stringify(next)); return next; });
          }
        } catch (pollError: any) { setVideoJobs(current => current.map(item => item.id === job.id ? { ...item, error: pollError.message, status: "FAILED" } : item)); }
      }));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [apiKey, trpcUtils, videoJobs]);

  const submitVideoBatch = async () => {
    if (!apiKey) { setSettingsOpen(true); toast.error("Configura tu API Key de NanoGPT para continuar."); return; }
    if (!prompt.trim()) { setError("Añade una instrucción para tu vídeo."); return; }
    if (!selectedModel || modelKind !== "video") { setError("Selecciona un modelo de vídeo i2v."); return; }
    if (!hasCapability(selectedModel, "image_to_video")) { setError("El modelo seleccionado no admite image-to-video."); return; }
    if (!references.length) { setError("Añade al menos una imagen de referencia para iniciar i2v."); return; }
    setError(""); dispatchGeneration({ type: "start" });
    const refs = Array.from({ length: videoBatchSize }, (_, index) => references[index % references.length]);
    try {
      const responses: any[] = await Promise.all(refs.map(imageDataUrl => videoGenerateMutation.mutateAsync({ apiKey, model: modelId, prompt, imageDataUrl, ...(videoDurationKey === "seconds" ? { seconds: videoDuration } : { duration: videoDuration }), aspect_ratio: videoAspect, resolution: videoResolution })));
      const jobs = responses.map((result, index) => ({ id: `${Date.now()}-${index}`, runId: result?.runId || result?.id || result?.data?.runId || result?.data?.id, model: modelId, prompt, reference: refs[index], status: String(result?.status || result?.data?.status || "PENDING").toUpperCase(), cost: typeof result?.cost === "number" ? result.cost : typeof result?.data?.cost === "number" ? result.data.cost : undefined } as VideoJob)).filter(job => job.runId);
      if (!jobs.length) throw new Error("NanoGPT no devolvió identificadores de trabajo.");
      setVideoJobs(current => [...jobs, ...current].slice(0, 24));
      toast.success(`${jobs.length} trabajo${jobs.length === 1 ? "" : "s"} i2v enviado${jobs.length === 1 ? "" : "s"}`);
      dispatchGeneration({ type: "success", count: jobs.length });
    } catch (err: any) { const message = err.message || "No se pudo enviar el lote i2v."; setError(message); dispatchGeneration({ type: "error", message }); }
  };

  return <div className="min-h-screen bg-[#0b0c0e] text-[#e7e9ed]">
    <header className="h-[68px] border-b border-[#24262a] flex items-center justify-between px-4 md:px-7 sticky top-0 z-30 bg-[#0b0c0e]/95 backdrop-blur">
      <div className="flex items-center gap-3"><button onClick={() => setSidebarOpen(v => !v)} className="h-8 w-8 rounded-lg border border-[#292c31] text-[#777d87] hover:text-[#c8ff32] grid place-items-center transition" aria-label={sidebarOpen ? "Replegar panel izquierdo" : "Desplegar panel izquierdo"}>{sidebarOpen ? <PanelLeftClose size={15}/> : <PanelLeftOpen size={15}/>}</button><div className="font-bold tracking-[-.05em] text-[17px]">GENSTUDIO <span className="text-[#c8ff32]">NEXT</span></div></div>
      <div className="hidden sm:flex rounded-lg bg-[#090a0c] p-1 border border-[#16181b]"><button onClick={() => setActiveTab("generate")} className={`px-8 py-2 rounded-md text-[10px] uppercase tracking-[.13em] font-semibold ${activeTab === "generate" ? "bg-[#1b1d20] text-white" : "text-[#676c74]"}`}>Generación</button><button onClick={() => setActiveTab("compose")} className={`px-8 py-2 rounded-md text-[10px] uppercase tracking-[.13em] font-semibold ${activeTab === "compose" ? "bg-[#1b1d20] text-white" : "text-[#676c74]"}`}>Compositor</button></div>
      <div className="relative"><button onClick={() => setSettingsOpen(v => !v)} className={`h-9 w-9 rounded-lg border grid place-items-center transition ${settingsOpen ? "border-[#c8ff32] text-[#c8ff32]" : "border-[#2b2e33] text-[#868b94] hover:text-white"}`} aria-label="Configuración"><Menu size={18}/></button>{settingsOpen && <div className="absolute right-0 top-12 w-[min(350px,calc(100vw-32px))] panel-surface rounded-xl p-4 shadow-2xl z-40 fade-in"><div className="flex justify-between items-start mb-4"><div><div className="text-xs font-bold uppercase tracking-[.14em]">Conexión NanoGPT</div><div className="text-[11px] text-[#7c8189] mt-1">La clave se guarda solo en esta sesión.</div></div><KeyRound size={17} className="text-[#c8ff32]"/></div><label className="text-[10px] text-[#8a9098] uppercase tracking-[.12em]">API Key</label><div className="flex gap-2 mt-2"><input type="password" value={keyDraft} onChange={e => { setKeyDraft(e.target.value); setKeyStatus("idle"); }} placeholder="ngpt_••••••••••••" className="min-w-0 flex-1 bg-[#0b0c0e] border border-[#2c3035] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#c8ff32]"/><button onClick={saveKey} disabled={keyStatus === "checking"} className="px-3 rounded-lg bg-[#c8ff32] text-[#10120d] text-[11px] font-bold">{keyStatus === "checking" ? <Loader2 size={15} className="animate-spin"/> : "Validar"}</button></div>{apiKey && <div className="flex items-center justify-between mt-3 text-[11px]"><span className={keyStatus === "valid" ? "text-[#c8ff32]" : "text-[#ff8d86]"}>{keyStatus === "valid" ? <ShieldCheck size={13} className="inline mr-1"/> : <AlertCircle size={13} className="inline mr-1"/>}{maskKey(apiKey)}</span><button onClick={removeKey} className="text-[#888e97] hover:text-[#ff8d86] flex items-center gap-1"><Trash2 size={12}/> Eliminar</button></div>}</div>}</div>
    </header>
    <div className="sm:hidden px-4 pt-4"><div className="flex rounded-lg bg-[#090a0c] p-1 border border-[#16181b]"><button onClick={() => setActiveTab("generate")} className={`flex-1 py-2 rounded-md text-[10px] uppercase tracking-[.13em] font-semibold ${activeTab === "generate" ? "bg-[#1b1d20] text-white" : "text-[#676c74]"}`}>Generación</button><button onClick={() => setActiveTab("compose")} className={`flex-1 py-2 rounded-md text-[10px] uppercase tracking-[.13em] font-semibold ${activeTab === "compose" ? "bg-[#1b1d20] text-white" : "text-[#676c74]"}`}>Compositor</button></div></div>
    <main className={`min-h-[calc(100vh-68px)] ${sidebarOpen ? "grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]" : "block"}`}>
      {sidebarOpen && <aside className="border-r border-[#24262a] p-5 md:p-6 space-y-4 bg-[#101113]"><div className="text-[10px] uppercase tracking-[.14em] text-[#858a92] mb-2">Prompt</div><textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="Escribe una instrucción para comenzar" className="w-full h-[150px] resize-none bg-[#17181b] border border-[#2a2c31] rounded-xl p-3 text-sm leading-6 outline-none focus:border-[#c8ff32]/60 placeholder:text-[#565b63]"/><div className="flex justify-between text-[10px] text-[#777c85]"><span>{prompt.length} caracteres</span><button onClick={() => setPrompt("")} className="hover:text-white">Borrar prompt</button></div><div className="flex gap-2"><button onClick={() => setModelPickerOpen(true)} className="flex-1 bg-[#c8ff32] hover:bg-[#d8ff68] text-left text-[#0a0c0b] rounded-lg px-3 py-2 text-xs font-bold truncate transition" title="Escoger modelo">{selectedModel?.name || "Escoger modelo"}<ChevronDown size={13} className="inline ml-1"/></button><button onClick={submitGeneration} disabled={loading || !modelId || modelsLoading} className="flex-[1.8] rounded-lg bg-[#2c2d32] hover:bg-[#383a40] disabled:opacity-50 px-3 py-2 text-xs font-semibold">{loading ? <Loader2 size={15} className="animate-spin mx-auto"/> : modelKind === "video" ? "SOLO IMAGEN" : <>GENERAR <span className="ml-1 text-[9px] text-[#9da1a8]">{costLabel}</span></>}</button><button onClick={openJsonJob} className="rounded-lg border border-[#33363b] px-3 py-2 text-[10px] text-[#aab0b8] hover:border-[#c8ff32] hover:text-[#c8ff32]">JSON</button></div><div className="panel-surface rounded-xl p-4"><div className="text-[10px] uppercase tracking-[.14em] text-[#868b93] mb-2">Preset modules</div><div className="grid grid-cols-2 gap-2">{studioPresets.map(preset => <button key={preset.key} onClick={() => choosePreset(preset.key)} className={`rounded-lg border p-2 text-left transition ${presetKey === preset.key ? "border-[#c8ff32] bg-[#19200f]" : "border-[#292c31] bg-[#141619] hover:border-[#5e6d35]"}`}><div className="text-[10px] font-semibold text-[#e2e5e8]">{preset.name}</div><div className="text-[9px] text-[#6f757e] mt-1 line-clamp-2">{preset.description}</div></button>)}</div><div className="text-[9px] uppercase tracking-[.12em] text-[#6f757e] mt-3 mb-2">{selectedPreset.name} · variant</div><div className="grid grid-cols-2 gap-1">{selectedPreset.variants.map(variant => <button key={variant.id} onClick={() => setPresetVariant(variant.id)} className={`rounded-md px-2 py-1.5 text-left text-[9px] ${presetVariant === variant.id ? "bg-[#c8ff32] text-[#10120d]" : "bg-[#1b1d20] text-[#858b94] hover:text-white"}`}>{variant.name}</button>)}</div></div><div className="panel-surface rounded-xl p-4"><div className="text-[10px] uppercase tracking-[.14em] text-[#868b93] mb-2">Historial de prompts <span className="text-[#c8ff32]">· {history.length}</span></div>{history.length ? <div className="space-y-1">{history.slice(0, 4).map((item, i) => <button key={i} onClick={() => setPrompt(item)} className="w-full text-left text-[11px] text-[#a4a8ae] hover:text-white truncate py-1">{item}</button>)}</div> : <div className="text-[11px] text-[#575c64]">Tus prompts recientes aparecerán aquí.</div>}</div><div className="panel-surface rounded-xl p-4 space-y-3"><div className="flex items-center justify-between"><div className="text-[10px] uppercase tracking-[.14em] text-[#868b93]">Parámetros del modelo</div><span className="text-[9px] text-[#626870] uppercase">Descubiertos</span></div><div><div className="flex justify-between text-[11px] mb-1"><span className="text-[#8b9098]">Resolución</span><span className="text-[#c8ff32] mono">{size}</span></div><select value={size} onChange={e => setSize(e.target.value)} className="w-full bg-[#17181b] border border-[#2b2d31] rounded-lg px-3 py-2 text-xs outline-none">{resolutions.map(r => <option key={r}>{r}</option>)}</select></div><div><div className="flex justify-between text-[11px] mb-1"><span className="text-[#8b9098]">Resultados</span><span className="text-[#c8ff32] mono">{count}</span></div><input type="range" min="1" max={Math.min(4, selectedModel?.supported_parameters?.max_images || 4)} value={count} onChange={e => setCount(Number(e.target.value))} className="w-full accent-[#c8ff32]"/></div>{supportsQuality && <div><div className="flex justify-between text-[11px] mb-1"><span className="text-[#8b9098]">Calidad</span><span className="text-[#c8ff32] mono">{quality}</span></div><div className="grid grid-cols-3 gap-1">{["low", "medium", "high"].map(q => <button key={q} onClick={() => setQuality(q)} className={`py-1.5 rounded text-[10px] uppercase ${quality === q ? "bg-[#c8ff32] text-[#0d100a]" : "bg-[#1b1d20] text-[#777d86]"}`}>{q}</button>)}</div></div>}</div></aside>}
      <section className="p-4 md:p-7 flex justify-center min-w-0"><div className="w-full max-w-[1180px] space-y-3"><div className="panel-surface rounded-2xl overflow-hidden"><div className="h-11 border-b border-[#26282d] flex items-center justify-between px-4"><div className="text-[10px] font-semibold uppercase tracking-[.14em]">{activeTab === "compose" ? "Componer imágenes" : "Adjuntar imagen"}</div><div className="flex items-center gap-2 text-[#8a9098]"><button onClick={() => fileRef.current?.click()} className="hover:text-[#c8ff32]" title="Subir referencias"><Plus size={15}/></button><span className="bg-[#c8ff32] text-[#11150b] px-2 py-1 rounded-full text-[10px] font-bold">{references.length}</span><ChevronDown size={13}/></div></div><input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={e => addFiles(e.target.files)}/><div className={`min-h-[230px] md:min-h-[310px] m-3 rounded-xl border border-[#23252a] faint-grid flex items-center justify-center ${references.length ? "p-4" : "p-8"}`}>{references.length ? <div className="w-full"><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{references.map((src, i) => <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-[#3a3d43]"><img src={src} className="w-full h-full object-cover"/><button onClick={() => setReferences(r => r.filter((_, x) => x !== i))} className="absolute top-2 right-2 bg-black/70 rounded-full p-1 text-white"><X size={13}/></button></div>)}<button onClick={() => fileRef.current?.click()} className="aspect-square rounded-lg border border-dashed border-[#484c54] grid place-items-center text-[#7c828b] hover:text-[#c8ff32] hover:border-[#c8ff32]"><ImagePlus size={22}/></button></div><div className="text-center text-[11px] text-[#777d85] mt-4">Añade hasta 4 referencias para guiar {activeTab === "compose" ? "la composición" : "el resultado"}.</div></div> : <button onClick={() => fileRef.current?.click()} className="text-center group"><div className="mx-auto mb-3 text-3xl grayscale opacity-70 group-hover:grayscale-0 transition">🖼️</div><div className="text-[12px] text-[#9a9fa7]">{modelsLoading ? "Cargando catálogo de modelos…" : modelsError ? "No se pudo conectar con NanoGPT" : "Arrastra o añade una referencia"}</div><div className="text-[11px] text-[#5d626a] mt-2">Las referencias solo se envían en el modo Compositor.<br/><span className="text-[#c8ff32]">Haz clic para subir una imagen</span></div></button>}</div></div><div className="panel-surface rounded-2xl overflow-hidden"><div className="h-11 px-4 flex items-center justify-between"><div className="text-[10px] uppercase tracking-[.14em] text-[#8e939b]">Procesamiento</div><div className="text-[10px] text-[#696f78]">{loading ? "Procesando…" : modelKind === "video" ? "Cola i2v lista" : "Listo para crear"} <ChevronRight size={12} className="inline"/></div></div>{modelsError && <div className="border-t border-[#24262a] px-4 py-3 text-[11px] text-[#ffaaa3] flex items-center justify-between"><span><AlertCircle size={13} className="inline mr-1"/>No se pudo cargar el catálogo completo.</span><button onClick={retryModels} className="underline hover:text-white">Reintentar</button></div>}{modelKind === "video" && <div className="border-t border-[#24262a] p-4 space-y-4"><div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><label className="text-[11px] text-[#8b9098]">Trabajos del lote<span className="block text-[#c8ff32] mono mt-1">{videoBatchSize}</span><input type="range" min="1" max={videoBatchMax} value={videoBatchSize} onChange={e => setVideoBatchSize(Number(e.target.value))} className="w-full mt-2 accent-[#c8ff32]"/></label><label className="text-[11px] text-[#8b9098]">Duración<select value={videoDuration} onChange={e => setVideoDuration(e.target.value)} className="block w-full mt-2 bg-[#17181b] border border-[#2b2d31] rounded-lg px-3 py-2 text-xs outline-none">{videoDurations.map(value => <option key={value} value={value}>{value} segundos</option>)}</select></label><label className="text-[11px] text-[#8b9098]">Formato<select value={videoAspect} onChange={e => setVideoAspect(e.target.value)} className="block w-full mt-2 bg-[#17181b] border border-[#2b2d31] rounded-lg px-3 py-2 text-xs outline-none">{videoAspects.map(value => <option key={value}>{value}</option>)}</select></label><label className="text-[11px] text-[#8b9098]">Resolución<select value={videoResolution} onChange={e => setVideoResolution(e.target.value)} className="block w-full mt-2 bg-[#17181b] border border-[#2b2d31] rounded-lg px-3 py-2 text-xs outline-none">{videoResolutions.map(r => <option key={r}>{r}</option>)}</select></label></div><div className="flex items-center justify-between gap-3"><div className="text-[11px] text-[#6f757e]">Cada trabajo usa una referencia y se consulta hasta quedar completado.</div><button onClick={submitVideoBatch} disabled={loading} className="shrink-0 rounded-lg bg-[#c8ff32] text-[#10120d] px-4 py-2 text-xs font-bold disabled:opacity-50">{loading ? <Loader2 size={14} className="animate-spin"/> : <>LANZAR LOTE I2V <span className="ml-1 text-[9px] opacity-80">{costLabel}</span></>}</button></div>{videoJobs.length > 0 && <div className="space-y-2 pt-1">{videoJobs.slice(0, 6).map(job => <div key={job.id} className="rounded-lg border border-[#2b3035] bg-[#141619] p-3 flex items-center gap-3"><img src={job.reference} className="h-10 w-10 rounded object-cover"/><div className="min-w-0 flex-1"><div className="text-[11px] text-white truncate">{job.prompt}</div><div className="text-[10px] text-[#7d838b] mt-1">{job.status === "COMPLETED" ? "Vídeo listo" : job.status === "FAILED" ? job.error || "Error en el trabajo" : `Procesando · ${job.status}`}</div></div><span className="text-right"><span className={`block text-[10px] mono ${job.status === "COMPLETED" ? "text-[#c8ff32]" : job.status === "FAILED" ? "text-[#ffaaa3]" : "text-[#f4d98e]"}`}>{job.status}</span>{job.cost !== undefined && <span className="block text-[9px] text-[#a5ad9a] mt-1">{formatCost(job.cost)}</span>}</span></div>)}</div>}</div>}</div><div className="panel-surface rounded-2xl overflow-hidden"><div className="h-11 px-4 flex items-center justify-between"><div className="text-[10px] uppercase tracking-[.14em] text-[#8e939b]">Outputs <span className="text-[#c8ff32]">· {gallery.length}</span></div><button className="text-[#696f78] hover:text-white"><ChevronRight size={13}/></button></div>{error && <div className="mx-4 mb-4 rounded-lg border border-[#713d3d] bg-[#301b1c] text-[#ffaaa3] text-xs p-3 flex items-center gap-2"><AlertCircle size={15}/>{error}</div>}{loading && <div className="mx-4 mb-4 rounded-xl border border-[#35421f] bg-[#17200f] p-5 flex items-center gap-4"><div className="h-9 w-9 rounded-full border-2 border-[#c8ff32] border-t-transparent animate-spin"/><div><div className="text-sm text-white">Creando tu imagen…</div><div className="text-[11px] text-[#97a67c] mt-1">NanoGPT está procesando tu prompt y los parámetros admitidos.</div></div></div>}{gallery.length ? <div className="p-4 pt-0 grid grid-cols-2 xl:grid-cols-4 gap-3">{gallery.map(item => <div key={item.id} className="group relative aspect-square rounded-xl overflow-hidden bg-[#17181b] border border-[#2a2c30]">{item.kind === "video" ? <video src={item.url} controls className="w-full h-full object-cover" /> : <img src={item.url} alt={item.prompt} className="w-full h-full object-cover"/>}<div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 to-transparent translate-y-full group-hover:translate-y-0 transition-transform"><div className="text-[10px] text-white truncate">{item.prompt}</div><a href={item.url} download={`genstudio-${item.id}.${item.kind === "video" ? "mp4" : "png"}`} className="text-[10px] text-[#c8ff32] mt-1 inline-flex items-center gap-1"><Download size={11}/> Descargar</a></div></div>)}</div> : !loading && <div className="p-10 md:p-16 text-center text-[#575c64]"><Sparkles size={24} className="mx-auto mb-3 text-[#555a61]"/><div className="text-xs">El lienzo está listo</div><div className="text-[11px] mt-2">Elige un modelo, escribe una instrucción y genera tu primera variación.</div></div>}</div></div></section>
    </main>
    {modelPickerOpen && <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-start justify-center p-4 md:p-16" onMouseDown={e => { if (e.target === e.currentTarget) setModelPickerOpen(false); }}><div className="w-full max-w-[720px] max-h-[calc(100vh-32px)] md:max-h-[680px] panel-surface rounded-2xl shadow-2xl overflow-hidden fade-in"><div className="p-5 border-b border-[#292c31] flex items-start justify-between"><div><div className="text-sm font-semibold">Escoger modelo</div><div className="text-[11px] text-[#777d85] mt-1">Catálogo NanoGPT · selecciona un modelo para continuar</div></div><button onClick={() => setModelPickerOpen(false)} className="text-[#7e848c] hover:text-white"><X size={18}/></button></div><div className="p-4 border-b border-[#24262a]"><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#686e77]"/><input autoFocus value={modelSearch} onChange={e => setModelSearch(e.target.value)} placeholder="Buscar por nombre, proveedor o capacidad…" className="w-full bg-[#0b0c0e] border border-[#2c3035] rounded-lg pl-9 pr-3 py-2.5 text-xs outline-none focus:border-[#c8ff32]"/></div></div><div className="overflow-y-auto max-h-[460px] p-4 space-y-5"><ModelSection title="Imagen" icon={<ImagePlus size={15}/>} models={filteredImages} selectedId={modelKind === "image" ? modelId : ""} loading={imageModelsQuery.isLoading} empty={Boolean(modelSearch)} onChoose={m => chooseModel(m, "image")} onRetry={() => void imageModelsQuery.refetch()} /><ModelSection title="Video" icon={<Video size={15}/>} models={filteredVideos} selectedId={modelKind === "video" ? modelId : ""} loading={videoModelsQuery.isLoading} empty={Boolean(modelSearch)} onChoose={m => chooseModel(m, "video")} onRetry={() => void videoModelsQuery.refetch()} /></div></div></div>}
    {jsonOpen && <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-start justify-center p-4 md:p-16" onMouseDown={e => { if (e.target === e.currentTarget) setJsonOpen(false); }}><div className="w-full max-w-[720px] panel-surface rounded-2xl shadow-2xl overflow-hidden fade-in"><div className="p-5 border-b border-[#292c31] flex items-start justify-between"><div><div className="text-sm font-semibold">JSON job</div><div className="text-[11px] text-[#777d85] mt-1">{selectedPreset.name} · {selectedVariant.name}</div></div><button onClick={() => setJsonOpen(false)} className="text-[#7e848c] hover:text-white"><X size={18}/></button></div><div className="p-4"><textarea value={jsonValue} onChange={e => setJsonValue(e.target.value)} spellCheck={false} className="w-full min-h-[270px] bg-[#0b0c0e] border border-[#2c3035] rounded-xl p-4 text-[11px] leading-6 text-[#c8ff32] mono outline-none focus:border-[#c8ff32]"/><div className="flex justify-end gap-2 mt-3"><button onClick={copyJsonJob} className="px-3 py-2 rounded-lg border border-[#33363b] text-[11px] text-[#aab0b8] hover:border-[#c8ff32] hover:text-[#c8ff32]">{jsonCopied ? "Copiado" : "Copiar JSON"}</button><button onClick={() => { setJsonOpen(false); submitGeneration(); }} className="px-4 py-2 rounded-lg bg-[#c8ff32] text-[#10120d] text-[11px] font-bold">Ejecutar job</button></div></div></div></div>}
    <footer className="fixed bottom-3 right-4 hidden md:flex items-center gap-3 text-[10px] text-[#555a62]"><span><CircleHelp size={13} className="inline mr-1"/>Ayuda</span><span><Zap size={12} className="inline mr-1 text-[#c8ff32]"/>Catálogo NanoGPT bajo demanda</span></footer>
  </div>;
}

function ModelSection({ title, icon, models, selectedId, loading, empty, onChoose, onRetry }: { title: string; icon: React.ReactNode; models: CatalogModel[]; selectedId: string; loading: boolean; empty: boolean; onChoose: (model: CatalogModel) => void; onRetry: () => void }) {
  return <section><div className="flex items-center justify-between mb-2"><div className="flex items-center gap-2 text-xs font-semibold"><span className="text-[#c8ff32]">{icon}</span>{title}<span className="text-[10px] text-[#666c74] mono">{models.length}</span></div><span className="text-[10px] uppercase tracking-[.12em] text-[#5e646d]">modelos disponibles</span></div>{loading ? <div className="rounded-xl border border-[#292c31] p-5 text-[11px] text-[#7c828b] flex items-center gap-2"><Loader2 size={14} className="animate-spin text-[#c8ff32]"/> Cargando catálogo…</div> : models.length ? <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{models.map(model => <button key={model.id} onClick={() => onChoose(model)} className={`text-left rounded-xl border p-3 transition ${selectedId === model.id ? "border-[#c8ff32] bg-[#19200f]" : "border-[#292c31] bg-[#141619] hover:border-[#5e6d35] hover:bg-[#191b1e]"}`}><div className="flex items-start justify-between gap-3"><div className="text-xs font-semibold text-[#e2e5e8] truncate">{model.name || model.id}</div>{selectedId === model.id && <ShieldCheck size={14} className="text-[#c8ff32] shrink-0"/>}</div><div className="text-[10px] text-[#6f757e] mt-1 line-clamp-2">{model.description || model.id}</div><div className="text-[9px] text-[#8c939b] mt-2 mono truncate">{model.id}</div></button>)}</div> : <div className="rounded-xl border border-dashed border-[#30343a] p-5 text-[11px] text-[#6f757e]">{empty ? "No hay coincidencias para esta búsqueda." : <span>No hay modelos cargados. <button onClick={onRetry} className="underline hover:text-white">Reintentar</button></span>}</div>}</section>;
}

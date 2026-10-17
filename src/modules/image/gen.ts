/**
 * image/gen.ts — 生图服务：OpenAI 兼容 POST {baseUrl}/images/generations
 * · 支持 b64_json 与 url 两种返回；超时可由调用方 AbortController 控制
 * · OpenAI 系（gpt-image-* / dall-e-*）没有独立负面词参数，负面词以 "Avoid: …" 附加到 prompt
 * · 附：服务商预设 + 不花钱的端点测试（查 /models 是否包含所配模型）
 */

/** 生图服务商预设（OpenAI 官方 + 第三方，全部走 OpenAI 兼容 /images/generations） */
export const IMAGE_PROVIDERS = [
  { id: "openai-image", name: "OpenAI 官方 · gpt-image-1", baseUrl: "https://api.openai.com/v1", model: "gpt-image-1", hint: "官方生图模型，质量最高" },
  { id: "openai-dalle", name: "OpenAI 官方 · DALL·E 3", baseUrl: "https://api.openai.com/v1", model: "dall-e-3", hint: "官方上一代，速度更快" },
  { id: "zhipu", name: "智谱 CogView", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "cogview-3-plus", hint: "国内直连，OpenAI 兼容生图" },
  { id: "ark", name: "火山引擎 Ark", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-seedream-3-0-t2i", hint: "模型名填控制台开通的接入点 ID" },
  { id: "siliconflow", name: "硅基流动 Kolors", baseUrl: "https://api.siliconflow.cn/v1", model: "Kwai-Kolors/Kolors", hint: "按量计费，需先在控制台充值" },
];

/** 生图端点测试：不动钱，查 /models 是否开放 + 是否包含所配模型 */
export async function testImageGenEndpoint(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(baseUrl.replace(/\/+$/, "") + "/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { ok: false, message: "Key 被拒绝（401/403）" };
      return { ok: false, message: `服务返回 ${res.status}` };
    }
    const json = await res.json();
    const ids: string[] = Array.isArray(json?.data) ? json.data.map((d: { id?: string }) => d.id).filter(Boolean) : [];
    if (!model) return { ok: true, message: `端点可用 · 共 ${ids.length} 个模型，填入模型名即可` };
    if (ids.some((id) => id.toLowerCase() === model.toLowerCase())) {
      return { ok: true, message: `端点可用 · 已找到 ${model} ✓` };
    }
    return { ok: true, message: `端点可用 · 列表未见「${model}」，若代理不开放模型列表可忽略` };
  } catch (e) {
    return { ok: false, message: `网络请求失败：${e instanceof Error ? e.message : e}` };
  }
}

export interface ImageGenConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  size: string;
  quality: string;
  positive: string;
  negative: string;
}

export interface ImageGenResult {
  /** data URI（b64）或 https URL，可直接给 <img> src */
  src: string;
  revisedPrompt?: string;
}

/** 拼接最终 prompt：主体 + 正面预设；OpenAI 系负面词转 "Avoid: …" */
export function buildImagePrompt(cfg: Pick<ImageGenConfig, "positive" | "negative" | "model">, subject: string): string {
  const parts: string[] = [];
  if (cfg.positive.trim()) parts.push(cfg.positive.trim());
  if (subject.trim()) parts.push(subject.trim());
  // OpenAI 系不支持独立负面词参数
  if (cfg.negative.trim() && /gpt-image|dall-e/i.test(cfg.model)) {
    parts.push(`Avoid: ${cfg.negative.trim()}`);
  }
  return parts.join(", ");
}

/** 生图：返回可直接展示的图像地址；失败抛错带服务商信息 */
export async function generateImage(cfg: ImageGenConfig, subject: string, signal?: AbortSignal): Promise<ImageGenResult> {
  if (!cfg.apiKey.trim()) throw new Error("先填生图 API Key（或沿用聊天的 Key）");
  const isOpenAI = /gpt-image|dall-e/i.test(cfg.model);
  const body: Record<string, unknown> = {
    model: cfg.model.trim(),
    prompt: buildImagePrompt(cfg, subject),
    n: 1,
  };
  if (cfg.size.trim()) body.size = cfg.size.trim();
  // gpt-image-1 用 low/medium/high；dall-e-3 用 standard/hd；auto 时透传（多数第三方忽略或兼容）
  if (cfg.quality.trim() && cfg.quality !== "auto") body.quality = cfg.quality.trim();
  // 负面词只对真正支持 negative_prompt 的第三方（Stable Diffusion 系）传独立参数
  if (!isOpenAI && cfg.negative.trim()) body.negative_prompt = cfg.negative.trim();

  const res = await fetch(cfg.baseUrl.replace(/\/+$/, "") + "/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey.trim()}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = (j?.error?.message ?? j?.message ?? "").toString().slice(0, 160);
    } catch {
      /* 非 JSON 错误体 */
    }
    throw new Error(`HTTP ${res.status}${detail ? ` · ${detail}` : ""}`);
  }
  const json = await res.json();
  const item = json?.data?.[0];
  if (item?.b64_json) return { src: `data:image/png;base64,${item.b64_json}`, revisedPrompt: item.revised_prompt };
  if (item?.url) return { src: item.url as string, revisedPrompt: item.revised_prompt };
  throw new Error("返回里没有图片（b64_json/url 都没有）");
}

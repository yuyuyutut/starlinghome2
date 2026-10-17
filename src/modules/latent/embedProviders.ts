/**
 * latent/embedProviders.ts — 云端 embedding 服务商预设 + 连接测试
 * 各家都走 OpenAI 兼容的 POST {baseUrl}/embeddings 形状（与 embed.ts 的 cloudEmbed 对齐），
 * 不内置任何 SDK；预设只填地址和默认模型，密钥永远由用户自己填。
 */

export interface EmbedProvider {
  id: string;
  name: string;
  kind: "official" | "third";
  baseUrl: string;
  model: string;
  hint?: string;
}

/** 官方与第三方预设（自定义 = 手动填地址） */
export const EMBED_PROVIDERS: EmbedProvider[] = [
  { id: "openai", name: "OpenAI 官方", kind: "official", baseUrl: "https://api.openai.com/v1", model: "text-embedding-3-small" },
  { id: "gemini", name: "Gemini 官方", kind: "official", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-embedding-001", hint: "Gemini 的 OpenAI 兼容端点，Key 用 Gemini API Key" },
  { id: "siliconflow", name: "硅基流动", kind: "third", baseUrl: "https://api.siliconflow.cn/v1", model: "BAAI/bge-m3", hint: "国内直连，bge-m3 免部署" },
  { id: "dashscope", name: "阿里云百炼", kind: "third", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "text-embedding-v3", hint: "DashScope 兼容模式端点" },
  { id: "zhipu", name: "智谱 BigModel", kind: "third", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "embedding-3" },
  { id: "jina", name: "Jina AI", kind: "third", baseUrl: "https://api.jina.ai/v1", model: "jina-embeddings-v3" },
  { id: "openrouter", name: "OpenRouter", kind: "third", baseUrl: "https://openrouter.ai/api/v1", model: "openai/text-embedding-3-small" },
  { id: "ark", name: "火山引擎 Ark", kind: "third", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-embedding", hint: "模型名需在控制台开通后填接入点 ID" },
  { id: "ollama", name: "Ollama 本地", kind: "third", baseUrl: "http://localhost:11434/v1", model: "nomic-embed-text", hint: "本机先 ollama pull 对应模型" },
];

export interface EmbedTestResult {
  ok: boolean;
  message: string;
  ms?: number;
  dims?: number;
}

/** 测试一次 embedding 连接：发一条短文本，回报耗时与向量维度 */
export async function testEmbedConnection(baseUrl: string, apiKey: string, model: string): Promise<EmbedTestResult> {
  const url = baseUrl.trim().replace(/\/+$/, "") + "/embeddings";
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify({ model: model.trim() || "bge-m3", input: "星语小屋连接测试" }),
    });
    const ms = Math.round(performance.now() - t0);
    if (!res.ok) {
      let detail = "";
      try {
        const j = await res.json();
        detail = (j?.error?.message ?? j?.message ?? "").toString().slice(0, 120);
      } catch {
        /* 非 JSON 错误体 */
      }
      return { ok: false, message: `HTTP ${res.status}${detail ? ` · ${detail}` : ""}`, ms };
    }
    const json = await res.json();
    const vec: unknown = json?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length === 0) {
      return { ok: false, message: "返回里没有 embedding 向量（端点形状不符）", ms };
    }
    return { ok: true, message: `连接成功 · ${ms}ms · ${vec.length} 维`, ms, dims: vec.length };
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    return { ok: false, message: `连接失败：${e instanceof Error ? e.message : e}`, ms };
  }
}

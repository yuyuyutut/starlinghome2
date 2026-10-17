/**
 * llm.ts — OpenAI 兼容接口的流式聊天客户端
 * API Key 只存在用户浏览器本地，请求直连服务商。
 * （公开部署时必须加后端代理，否则 key 会泄露——这是纯前端方案的固有限制。）
 */

/** 多模态内容块（vision：图片识别开启时 user 消息可携带图片） */
export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** 模型请求调用的工具（OpenAI function calling 形状） */
export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** 工具定义（latent_ 工具见 modules/latent/tools.ts） */
export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  /** role="assistant" 且模型发起了工具调用时携带 */
  tool_calls?: ToolCall[];
  /** role="tool" 时必填：对应哪个工具调用 */
  tool_call_id?: string;
  name?: string;
}

export interface StreamOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  /** 流式输出开关：false 时走非流式请求，整段完成后一次性回调（设置里的「流式输出」） */
  stream?: boolean;
  /** 每收到一段正文 token 回调一次 */
  onToken: (delta: string, full: string) => void;
  /** 收到思维链内容回调（reasoning_content / thinking 字段，取决于服务商） */
  onThinking?: (delta: string, full: string) => void;
  /** 额外请求参数，如 { thinking: { type: "enabled", budget_tokens: 2000 } } */
  extraBody?: Record<string, unknown>;
  /** Anthropic 思维链要求 temperature=1.0 */
  temperature?: number;
  /** 工具表（latent_ 记忆工具）；提供后模型可发起 tool_calls */
  tools?: ToolSpec[];
  /** 额外请求头（提示词缓存的稳定 session id 等；Authorization 已自带，加头不新增 CORS 预检） */
  headers?: Record<string, string>;
  /** 拿到 provider 返回的 usage 时回调（流式可能在最后一个 chunk；缓存观测日志用） */
  onUsage?: (usage: Record<string, unknown>) => void;
}

export interface ChatResult {
  text: string;
  thinking: string;
  toolCalls: ToolCall[];
}

export async function streamChat(opts: StreamOptions): Promise<ChatResult> {
  const url = opts.baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    signal: opts.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
      ...opts.headers,
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      stream: opts.stream !== false,
      temperature: opts.temperature ?? 0.8,
      ...(opts.tools ? { tools: opts.tools } : {}),
      ...opts.extraBody,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`请求失败 ${res.status}：${text.slice(0, 200)}`);
  }

  /* 非流式：整段返回，一次性回调（思维链在 message.reasoning_content 等字段里） */
  if (opts.stream === false) {
    const json = await res.json();
    if (json.usage && opts.onUsage) opts.onUsage(json.usage);
    const message = json.choices?.[0]?.message ?? {};
    const thinking = message.reasoning_content ?? message.reasoning ?? message.thinking ?? "";
    if (thinking && opts.onThinking) opts.onThinking(thinking, thinking);
    const full = message.content ?? "";
    opts.onToken("", full);
    const toolCalls: ToolCall[] = (message.tool_calls ?? []).map((t: ToolCall) => ({
      id: t.id,
      type: "function",
      function: { name: t.function?.name ?? "", arguments: t.function?.arguments ?? "" },
    }));
    return { text: full, thinking, toolCalls };
  }

  if (!res.body) throw new Error("浏览器不支持流式读取");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  let thinkFull = "";
  /** 流式 tool_calls 按 index 分段到达，这里拼接完整 */
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") {
        opts.onToken("", full);
        const toolCalls = [...toolAcc.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([, t]) => ({ id: t.id || `call_${Math.random().toString(36).slice(2)}`, type: "function" as const, function: { name: t.name, arguments: t.args } }));
        return { text: full, thinking: thinkFull, toolCalls };
      }
      try {
        const json = JSON.parse(payload);
        // 部分服务商在流里带 usage（最后一个 chunk 或 message_start），透传给观测层
        if (json.usage && opts.onUsage) opts.onUsage(json.usage);
        const d = json.choices?.[0]?.delta ?? {};
        // 思维链：不同服务商字段不同（reasoning_content 最常见）
        const thinking = d.reasoning_content ?? d.reasoning ?? d.thinking ?? "";
        if (thinking && opts.onThinking) {
          thinkFull += thinking;
          opts.onThinking(thinking, thinkFull);
        }
        // 工具调用分片：{ index, id?, function: { name?, arguments? } }
        if (Array.isArray(d.tool_calls)) {
          for (const tc of d.tool_calls as { index?: number; id?: string; function?: { name?: string; arguments?: string } }[]) {
            const idx = tc.index ?? 0;
            const slot = toolAcc.get(idx) ?? { id: "", name: "", args: "" };
            if (tc.id) slot.id = tc.id;
            if (tc.function?.name) slot.name += tc.function.name;
            if (tc.function?.arguments) slot.args += tc.function.arguments;
            toolAcc.set(idx, slot);
          }
        }
        const delta = d.content ?? "";
        if (delta) {
          full += delta;
          opts.onToken(delta, full);
        }
      } catch {
        /* 半包 JSON，跳过 */
      }
    }
  }
  opts.onToken("", full);
  const toolCalls = [...toolAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, t]) => ({ id: t.id || `call_${Math.random().toString(36).slice(2)}`, type: "function" as const, function: { name: t.name, arguments: t.args } }));
  return { text: full, thinking: thinkFull, toolCalls };
}

/** 测试连接：请求 /models，校验 Key 和地址是否可用 */
export async function testConnection(baseUrl: string, apiKey: string): Promise<{ ok: boolean; message: string }> {
  const url = baseUrl.replace(/\/+$/, "") + "/models";
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true, message: "连接成功，Key 有效 ✓" };
    if (res.status === 401 || res.status === 403) return { ok: false, message: "Key 被拒绝（401/403），检查一下是否复制完整" };
    return { ok: false, message: `服务返回 ${res.status}，地址或服务状态有问题` };
  } catch {
    return { ok: false, message: "网络请求失败，检查 Base URL 是否可达" };
  }
}

/** 拉取模型列表：设置页「拉取模型」按钮，返回排序后的模型 id（OpenAI 兼容 /models） */
export async function fetchModels(baseUrl: string, apiKey: string): Promise<string[]> {
  const url = baseUrl.replace(/\/+$/, "") + "/models";
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new Error("Key 被拒绝（401/403）");
    throw new Error(`服务返回 ${res.status}`);
  }
  const json: unknown = await res.json();
  const data = json && typeof json === "object" ? (json as { data?: unknown }).data : undefined;
  const list = Array.isArray(data) ? data : [];
  const ids: string[] = [];
  for (const m of list) {
    if (m && typeof m === "object") {
      const rec = m as { id?: unknown; name?: unknown };
      const id = rec.id ?? rec.name;
      if (typeof id === "string" && id.length > 0) ids.push(id);
    }
  }
  if (ids.length === 0) throw new Error("服务没有返回模型列表");
  return Array.from(new Set(ids)).sort();
}

/** 非流式调用（用于记忆总结等后台任务） */
export async function chatOnce(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[]
): Promise<string> {
  const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`请求失败 ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content ?? "";
}

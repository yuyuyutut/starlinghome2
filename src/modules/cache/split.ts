/**
 * cache/split.ts — Provider 提示词缓存（对齐 Cove 实践笔记）
 * 核心思想：缓存的不是回复，而是每轮都稳定的大块 prompt；
 * 稳定前缀打 cache_control 让 provider 缓存，动态尾巴（当前情境/时间/显影注入）留在普通输入。
 *
 * 分层顺序（compileSystemPrompt 已把【当前情境】放在最后，保证稳定字节是唯一前缀）：
 *   stable（人格/规则/旁白约定/工具说明/置顶记忆）→ 打 cache_control
 *   dynamic（【当前情境】时刻/好感度/问候 + 显影注入块）→ 不缓存
 *   tools（latent_ + read_user_thought schema）→ 列表末尾打一个缓存断点
 *
 * 适用：Anthropic Messages API / Claude Code 形态 / 支持 cache_control 的中转。
 * 普通 OpenAI 兼容端点会忽略这些字段（不报错的前提下），观测日志里 cache_read 恒为 0 即说明未生效。
 */

import type { ChatMessage, ToolSpec } from "@/lib/llm";

/** cache_control 断点（Anthropic prompt cache 形状） */
export interface CacheControl {
  type: "ephemeral";
}

/** 带缓存标记的文本块 / 工具定义 */
export interface CacheableTextBlock {
  type: "text";
  text: string;
  cache_control?: CacheControl;
}

/** 动态段起点标记：compileSystemPrompt 里【当前情境】固定出现在 prompt 末尾 */
export const DYNAMIC_MARKERS = ["【当前情境】"] as const;

/**
 * 把编译好的 system prompt 拆成 stable + dynamic 两段（对齐笔记 split_stable_and_dynamic_prompt）。
 * 没找到动态标记时整段视为 stable；dynamic 段为空时返回空串。
 */
export function splitStableDynamic(sysPrompt: string): { stable: string; dynamic: string } {
  const indexes = DYNAMIC_MARKERS.map((m) => sysPrompt.indexOf(m)).filter((i) => i >= 0);
  if (indexes.length === 0) return { stable: sysPrompt, dynamic: "" };
  const at = Math.min(...indexes);
  return { stable: sysPrompt.slice(0, at).trimEnd(), dynamic: sysPrompt.slice(at).trim() };
}

/**
 * 组缓存形态的 system content：stable 块带 cache_control，dynamic 块（若有）普通跟在后面。
 * 普通 OpenAI 端点也能接受 system content 为块数组，所以开关开着但对端不支持时请求仍然合法。
 */
export function buildCacheableSystem(stable: string, dynamic: string): CacheableTextBlock[] {
  const blocks: CacheableTextBlock[] = [];
  if (stable) blocks.push({ type: "text", text: stable, cache_control: { type: "ephemeral" } });
  if (dynamic) blocks.push({ type: "text", text: dynamic });
  return blocks;
}

/**
 * 工具 schema 缓存（对齐笔记 cacheable_tools_payload）：
 * 复制工具列表，只给最后一个工具加 cache_control，让前面全部稳定 schema 一起进缓存。
 */
export function cacheableTools(tools: ToolSpec[]): (ToolSpec & { cache_control?: CacheControl })[] {
  if (tools.length === 0) return [];
  const copied: (ToolSpec & { cache_control?: CacheControl })[] = tools.map((t) => ({
    ...t,
    function: { ...t.function },
  }));
  copied[copied.length - 1] = { ...copied[copied.length - 1], cache_control: { type: "ephemeral" } };
  return copied;
}

/** 剥掉所有 cache_control（工具 follow-up / 媒体请求降级用），内容结构保持不变 */
export function stripCacheControls(
  messages: ChatMessage[],
  tools?: ToolSpec[]
): { messages: ChatMessage[]; tools?: ToolSpec[] } {
  const cleanMessages = messages.map((m) => {
    if (m.role !== "system" || typeof m.content === "string") return m;
    return {
      ...m,
      content: m.content
        .filter((p) => p.type === "text")
        .map((p) => ({ type: "text" as const, text: p.text })),
    };
  });
  const cleanTools = tools?.map((t) => {
    const { cache_control: _drop, ...rest } = t as ToolSpec & { cache_control?: unknown };
    return rest as ToolSpec;
  });
  return { messages: cleanMessages, tools: cleanTools };
}

/**
 * 判断本轮请求是否应停用缓存（对齐笔记 §6）：
 * - 含图片等媒体块 → 停用（payload 形态变化大）
 * - 工具 follow-up（历史里已有 role="tool" 回执）→ 停用（形态特殊，强缓存易让 provider 行为不稳定）
 * 返回停用原因；null 表示可以缓存。
 */
export function cacheSkipReason(messages: ChatMessage[]): string | null {
  for (const m of messages) {
    if (Array.isArray(m.content) && m.content.some((p) => p.type !== "text")) {
      return "media";
    }
  }
  if (messages.some((m) => m.role === "tool")) return "tool_followup";
  return null;
}

/** 文本稳定哈希（观测日志用，判断同一稳定块是否跨请求保持一致） */
export function hashText(text: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0) ^ (h1 >>> 3);
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
}

/**
 * Claude Code 形态 provider 需要稳定 session id（笔记 §5：每轮随机 UUID 会让 provider
 * 认为是新的 cache scope，只创建、不读取）。这里对同一个 baseUrl 生成确定性的
 * uuid5 风格 ID，跨轮次保持不变。同步哈希实现，稳定性即可，不作安全用途。
 */
export function stableSessionId(provider: string): string {
  const src = `starling-home:prompt-cache:${provider || "default"}`;
  let h1 = 0x6a09e667;
  let h2 = 0xbb67ae85;
  let h3 = 0x3c6ef372;
  let h4 = 0xa54ff53a;
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    h1 = (Math.imul(h1 ^ c, 2654435761) >>> 0) + h2;
    h2 = (Math.imul(h2 ^ (c << 1), 1597334677) >>> 0) ^ h3;
    h3 = (Math.imul(h3 ^ (c << 2), 3812015801) >>> 0) + h4;
    h4 = (Math.imul(h4 ^ (c << 3), 966293589) >>> 0) ^ h1;
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  const p1 = hex(h1);
  const p2 = hex(h2).slice(0, 4);
  const p3 = "5" + hex(h3).slice(1, 4);
  const p4 = hex(h4).slice(0, 4);
  const p5 = (hex(h1 ^ h3) + hex(h2 ^ h4)).slice(0, 12);
  return `${p1}-${p2}-${p3}-${p4}-${p5}`;
}

/** 观测日志里的缓存段描述（对齐笔记 §7：path / kind / chars / hash） */
export interface CacheSegment {
  path: string;
  kind: "text" | "tools";
  chars?: number;
  hash: string;
}

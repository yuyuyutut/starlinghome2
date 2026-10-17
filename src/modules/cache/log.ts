/**
 * cache/log.ts — 缓存观测日志（对齐 Cove 笔记 §7：不要只看 provider dashboard）
 * 本地记录两类信息：
 *   1. 每轮 payload 里哪些位置加了 cache_control（段路径 / 类型 / 字数 / 哈希）
 *   2. provider 实际返回的 usage 里缓存创建与读取是多少
 * 用环形缓冲存 localStorage（"starling.cachelog"，最多 60 条），不进备份、不占 IndexedDB。
 */
import type { CacheSegment } from "./split";
import { hashText } from "./split";

const KEY = "starling.cachelog";
const MAX = 60;

export interface CacheRequestEvent {
  event: "request";
  ts: number;
  /** 本轮请求的 baseUrl（标记哪个 provider 节点） */
  provider: string;
  apiForm: "openai-compatible";
  /** 加了 cache_control 的段；为空数组表示本轮停用缓存 */
  segments: CacheSegment[];
  /** 停用原因（media / tool_followup），可缓存时为 null */
  skipped: string | null;
}

export interface CacheUsage {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
}

export interface CacheUsageEvent {
  event: "usage";
  ts: number;
  provider: string;
  usage: CacheUsage;
}

export type CacheLogEvent = CacheRequestEvent | CacheUsageEvent;

function readAll(): CacheLogEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as CacheLogEvent[]) : [];
  } catch {
    return [];
  }
}

function writeAll(events: CacheLogEvent[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(events.slice(-MAX)));
  } catch {
    /* 存储满时静默丢弃 */
  }
}

/** 记录本轮请求的缓存段布局（发送前调用） */
export function logCacheRequest(provider: string, segments: CacheSegment[], skipped: string | null): void {
  const events = readAll();
  events.push({ event: "request", ts: Date.now(), provider, apiForm: "openai-compatible", segments, skipped });
  writeAll(events);
}

/** 记录 provider 返回的 usage（流式/非流式拿到 usage 时调用；可能一轮调用多次，以最后一次为准） */
export function logCacheUsage(provider: string, usage: unknown): void {
  if (!usage || typeof usage !== "object") return;
  const u = usage as Record<string, unknown>;
  const pick = (k: string) => (typeof u[k] === "number" ? (u[k] as number) : undefined);
  const evt: CacheUsage = {
    input_tokens: pick("input_tokens"),
    cache_creation_input_tokens: pick("cache_creation_input_tokens"),
    cache_read_input_tokens: pick("cache_read_input_tokens"),
    output_tokens: pick("output_tokens"),
  };
  if (evt.input_tokens === undefined && evt.cache_read_input_tokens === undefined) return;
  const events = readAll();
  events.push({ event: "usage", ts: Date.now(), provider, usage: evt });
  writeAll(events);
}

export function readCacheLog(): CacheLogEvent[] {
  return readAll();
}

export function clearCacheLog(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** 最近一轮 usage（判断缓存是否命中的依据：cache_read 是否变大、input 是否变小） */
export function latestUsage(): CacheUsageEvent | null {
  const all = readAll();
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].event === "usage") return all[i] as CacheUsageEvent;
  }
  return null;
}

/** 最近一轮请求布局 */
export function latestRequest(): CacheRequestEvent | null {
  const all = readAll();
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].event === "request") return all[i] as CacheRequestEvent;
  }
  return null;
}

/** 汇总展示：最近一轮的状态文案 + 数字 */
export function cacheHealth(): {
  status: "hit" | "miss" | "unknown" | "skipped";
  detail: string;
  usage: CacheUsage | null;
  segments: CacheSegment[];
  skipped: string | null;
} {
  const req = latestRequest();
  const use = latestUsage();
  const usage = use?.usage ?? null;
  if (!req) return { status: "unknown", detail: "还没有记录，聊几句后再来看", usage: null, segments: [], skipped: null };
  if (req.skipped) {
    const why = req.skipped === "media" ? "本轮带图，按约定停用缓存" : "工具回执轮，按约定停用缓存";
    return { status: "skipped", detail: why, usage, segments: req.segments, skipped: req.skipped };
  }
  if (req.segments.length === 0) {
    return { status: "unknown", detail: "本轮没有加 cache_control", usage, segments: [], skipped: null };
  }
  const read = usage?.cache_read_input_tokens ?? 0;
  if (usage && read > 0) {
    return { status: "hit", detail: `缓存已命中：本轮 ${read.toLocaleString()} tokens 走了缓存读取`, usage, segments: req.segments, skipped: null };
  }
  if (usage) {
    return { status: "miss", detail: "已加 cache_control，但 provider 未返回缓存读取——确认对端是否支持 Anthropic 式缓存", usage, segments: req.segments, skipped: null };
  }
  return { status: "unknown", detail: "已发缓存请求，等 provider 返回 usage 后可见命中情况", usage: null, segments: req.segments, skipped: null };
}

/** 供日志条目展示的稳定短哈希 */
export { hashText };

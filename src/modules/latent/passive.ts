/**
 * latent/passive.ts — 自动浮现（Passive Recall）
 * 每轮用户消息发出、模型请求前由宿主（本前端）注入相关旧事，只存在于本次请求。
 * 两条路（对齐原版自动浮现）：
 * · 事实模式开启 → 完全改用事实路（surfaceFacts，见 facts.ts）
 * · 否则 → 块路径：BM25＋语义＋图谱三路检索记忆库原文
 */
import { searchMemories } from "./bm25";
import { semanticScores, type EmbedConfig } from "./embed";
import type { MemoryRecord } from "./types";

export interface PassiveResult {
  block: string;
  hitIds: string[];
}

/** 太短的消息（寒暄/语气词）不触发浮现，免得噪音注入 */
const MIN_QUERY_LEN = 4;

/** 块路径：检索记忆库原文，组装显影块 */
export async function buildPassiveBlock(
  records: MemoryRecord[],
  userText: string,
  cfg: EmbedConfig | null,
  limit = 3
): Promise<PassiveResult | null> {
  const q = userText.trim();
  if (q.length < MIN_QUERY_LEN) return null;
  const pool = records.filter((r) => !r.corrected);
  if (pool.length === 0) return null;
  const semantic = await semanticScores(cfg, pool, q);
  const hits = await searchMemories(pool, q, { limit, semantic });
  if (hits.length === 0) return null;
  const lines = hits.map(
    (h, i) => `${i + 1}. 《${h.record.title}》${h.record.body}\n   —— 当下：${h.record.status}`
  );
  const block = [
    "[显影 · 相关记忆]",
    "与 TA 这句话相关的旧事（仅供参考，自然融入即可，不要逐条复述）：",
    ...lines,
  ].join("\n");
  return { block, hitIds: hits.map((h) => h.record.id) };
}

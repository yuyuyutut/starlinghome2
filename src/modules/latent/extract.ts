/**
 * latent/extract.ts — 从对话里提炼「记录式」记忆草稿
 * 复用 memory/extractor.ts 的规则（零成本、零延迟），把产出升级为
 * Latent 形状：索引摘要 title + 正文 body + 当下状态 status。
 */
import { extractFromUserMessage, parseLLMSummary } from "@/modules/memory/extractor";
import type { MemoryRecord, RecordDraft } from "./types";

function titleOf(content: string): string {
  // 摘要式标题：取主干，最多 12 字
  const core = content
    .replace(/^TA /, "")
    .replace(/^(曾说起|有一个|约定要记住的事：|一个重要的日子：)/, "")
    .trim();
  return core.slice(0, 12);
}

/** 规则自动提炼：用户消息 → 记录草稿（无命中返回空数组） */
export function extractRecordsFromUserMessage(text: string): RecordDraft[] {
  return extractFromUserMessage(text).map((d) => ({
    title: titleOf(d.content),
    body: d.content,
    status: "当下仍有效",
    source: "auto",
  }));
}

/** LLM 总结文本 → 记录草稿 */
export function parseLLMRecords(text: string): RecordDraft[] {
  return parseLLMSummary(text).map((d) => ({
    title: titleOf(d.content),
    body: d.content,
    status: "当下仍有效",
    source: "llm",
  }));
}

/** 从记录里猜用户的名字（常驻人格层用） */
export function guessUserNameFromRecords(records: MemoryRecord[]): string | undefined {
  for (const r of records) {
    if (r.corrected || r.supersededBy) continue;
    const hit = r.body.match(/名字叫「(.{1,10})」/);
    if (hit) return hit[1];
  }
  return undefined;
}

/** 供 system prompt 的「常驻记忆」段：置顶记录 + 未撤回未变迁 */
export function pinnedLines(records: MemoryRecord[]): string[] {
  return records
    .filter((r) => r.pinned && !r.corrected && !r.supersededBy)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 6)
    .map((r) => `${r.body}（当下：${r.status}）`);
}

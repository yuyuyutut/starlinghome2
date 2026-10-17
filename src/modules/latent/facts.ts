/**
 * latent/facts.ts — 事实簿（Factbook）：从记忆里拆出的一句一条事实
 * 对齐原版 passive_facts.py：
 * · 事实模式开启时，自动浮现完全改用事实路（替代块路径）
 * · 用向量找与用户原句最像的两条，再带上同一条记忆拆出的、过噪音下限的几条（最多 3 条）
 * · 递出冷却：同一条事实短时间内不重复浮现；事实库只增不改，撤回/变迁在记忆层处理
 */
import { db } from "@/lib/db";
import { scoped } from "@/modules/character/characters";
import { semanticScores, type EmbedConfig } from "./embed";
import { latentState } from "./store";

export interface FactItem {
  id: string;
  charId?: string;
  /** 来源记忆 */
  memoryId: string;
  /** 一句一条 */
  text: string;
  ts: number;
  /** 上次浮现时间（冷却用） */
  lastSurfacedAt?: number;
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 冷却时长：同一条事实 4 小时内不重复递给模型 */
export const FACT_COOLDOWN = 4 * 3600 * 1000;
/** 噪音下限：低于此余弦分的事实不递出 */
const NOISE_FLOOR = 0.05;

export async function factsOf(charId: string): Promise<FactItem[]> {
  const all = await db.all<FactItem>("facts");
  return scoped(all, charId).sort((a, b) => a.ts - b.ts);
}

/** 把一段记忆正文拆成原子事实（规则式：按句切，过滤琐碎） */
export function splitIntoFacts(body: string): string[] {
  return body
    .split(/[。！？!?\n；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6 && s.length <= 80)
    .slice(0, 6);
}

/** 写记忆时同步追加事实（latent_append 的 facts 参数或自动拆分） */
export async function appendFactsForMemory(charId: string, memoryId: string, body: string, explicit?: string[]): Promise<number> {
  const existing = await factsOf(charId);
  const have = new Set(existing.map((f) => f.text));
  const texts = explicit && explicit.length > 0 ? explicit.map((t) => t.trim()).filter(Boolean) : splitIntoFacts(body);
  let n = 0;
  for (const text of texts) {
    if (have.has(text)) continue;
    await db.put("facts", { id: uid(), charId, memoryId, text, ts: Date.now() });
    n++;
  }
  return n;
}

/**
 * 全量回填：把没有事实覆盖的记忆拆进事实簿（latent_fact_backfill 的本地实现）。
 * 返回新建事实条数。
 */
export async function backfillFacts(charId: string): Promise<number> {
  const records = latentState().records.filter((r) => r.charId === charId && !r.corrected);
  const covered = new Set((await factsOf(charId)).map((f) => f.memoryId));
  let n = 0;
  for (const r of records) {
    if (covered.has(r.id)) continue;
    n += await appendFactsForMemory(charId, r.id, r.body);
  }
  return n;
}

export interface FactSurfacing {
  block: string;
  factIds: string[];
}

/**
 * 事实模式自动浮现：
 * 向量找与用户原句最像的两条 → 同记忆兄弟姐妹补到最多 3 条 → 冷却与噪音过滤。
 */
export async function surfaceFacts(charId: string, userText: string, cfg: EmbedConfig | null): Promise<FactSurfacing | null> {
  const facts = await factsOf(charId);
  const usable = facts.filter((f) => Date.now() - (f.lastSurfacedAt ?? 0) > FACT_COOLDOWN);
  if (usable.length === 0) return null;

  const scores = await semanticScores(
    cfg,
    usable.map((f) => ({ id: f.id, title: "", body: f.text, status: "" })),
    userText
  );
  const ranked = usable
    .map((f) => ({ f, s: scores.get(f.id) ?? 0 }))
    .filter((x) => x.s >= NOISE_FLOOR)
    .sort((a, b) => b.s - a.s);

  const picked: FactItem[] = [];
  const seenMem = new Set<string>();
  for (const { f } of ranked) {
    if (picked.length >= 2) break;
    picked.push(f);
    seenMem.add(f.memoryId);
  }
  // 兄弟姐妹：与已选中事实同一条记忆拆出的其它事实
  for (const { f } of ranked) {
    if (picked.length >= 3) break;
    if (seenMem.has(f.memoryId) && !picked.includes(f)) picked.push(f);
  }
  if (picked.length === 0) return null;

  const now = Date.now();
  const all = await db.all<FactItem>("facts");
  for (const f of all) {
    if (picked.some((p) => p.id === f.id)) await db.put("facts", { ...f, lastSurfacedAt: now });
  }

  const lines = picked.map((f, i) => `${i + 1}. ${f.text}`);
  return {
    block: ["[显影 · 事实簿]", "与 TA 这句话相关的事实（一句一条，自然融入即可）：", ...lines].join("\n"),
    factIds: picked.map((f) => f.id),
  };
}

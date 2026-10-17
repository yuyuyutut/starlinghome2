/**
 * latent/store.ts — 显影记忆的模块级状态 + IndexedDB 持久化
 * 与 pills/store 同构：模块级外部存储 + useSyncExternalStore，
 * useCompanion 初始化时按角色载入，UI 面板直接订阅。
 */
import { useSyncExternalStore } from "react";
import { db } from "@/lib/db";
import { scoped } from "@/modules/character/characters";
import type { MemoryRecord, RecordDraft, ThreadSnapshot, UnresolvedItem } from "./types";

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface LatentState {
  charId: string;
  records: MemoryRecord[];
  unresolved: UnresolvedItem[];
  threads: ThreadSnapshot[];
  /** 换窗召回的待注入文本（下一条消息发出时拼进请求，阅后即焚） */
  pendingRecall: string | null;
}

const EMPTY: LatentState = { charId: "", records: [], unresolved: [], threads: [], pendingRecall: null };

let state: LatentState = EMPTY;
const listeners = new Set<() => void>();

function emit(next: LatentState) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLatent(): LatentState {
  return useSyncExternalStore(subscribe, () => state);
}

/** 非 React 环境同步读取当前状态（useCompanion 的回调里用） */
export function latentState(): LatentState {
  return state;
}

/** 旧版平铺记忆（MemoryItem）→ MemoryRecord 迁移：正文搬入 body，标题自动截取 */
function migrateRow(old: Record<string, unknown>): MemoryRecord {
  const content = String(old.content ?? "");
  return {
    id: String(old.id ?? uid()),
    charId: old.charId as string | undefined,
    title: content.slice(0, 12),
    body: content,
    status: "当下仍有效",
    statusKind: "current",
    pinned: false,
    weight: 1,
    hits: 0,
    source: (old.source as MemoryRecord["source"]) ?? "manual",
    ts: Number(old.ts ?? Date.now()),
    updatedAt: Number(old.ts ?? Date.now()),
  };
}

/** 按角色载入四层数据（useCompanion 初始化 / 切换角色时调用），返回载入后的状态 */
export async function loadLatent(charId: string): Promise<LatentState> {
  const [rawMems, memsVer, unresolved, threads] = await Promise.all([
    db.all<Record<string, unknown> & { id: string }>("memories"),
    db.get<{ key: string; value: number }>("meta", "latent.schema"),
    db.all<UnresolvedItem>("unresolved"),
    db.all<ThreadSnapshot>("threads"),
  ]);
  const rows = rawMems as unknown as { id: string; charId?: string }[];
  let records = scoped(rows, charId) as unknown as MemoryRecord[];
  if (!memsVer || memsVer.value < 1) {
    // 首次进入显影模式：把当前角色的旧平铺记忆升级为记录式
    const mine = scoped(rows, charId) as unknown as Record<string, unknown>[];
    const migrated = mine.some((m) => m.title === undefined);
    if (migrated) {
      const upgraded = mine.map((m) => (m.title !== undefined ? (m as unknown as MemoryRecord) : migrateRow(m)));
      for (const r of upgraded) await db.put("memories", r);
      records = upgraded;
    }
    if (!memsVer) await db.put("meta", { key: "latent.schema", value: 1 });
  }
  const next: LatentState = {
    charId,
    records: records.sort((a, b) => a.ts - b.ts),
    unresolved: scoped(unresolved, charId).sort((a, b) => a.ts - b.ts),
    threads: scoped(threads, charId).sort((a, b) => a.closedAt - b.closedAt),
    pendingRecall: null,
  };
  emit(next);
  return next;
}

/** 新增记录：按标题/正文去重，返回实际写入的记录 */
export async function addRecords(charId: string, drafts: RecordDraft[]): Promise<MemoryRecord[]> {
  if (drafts.length === 0) return [];
  const now = Date.now();
  const existing = new Set(state.records.map((r) => `${r.title}|${r.body}`));
  const fresh: MemoryRecord[] = [];
  for (const d of drafts) {
    const title = d.title.trim().slice(0, 20) || d.body.trim().slice(0, 12);
    const body = d.body.trim();
    if (!body || existing.has(`${title}|${body}`)) continue;
    existing.add(`${title}|${body}`);
    fresh.push({
      id: uid(),
      charId,
      title,
      body,
      status: d.status.trim() || "当下仍有效",
      statusKind: "current",
      pinned: false,
      weight: 1,
      hits: 0,
      source: d.source,
      ts: now,
      updatedAt: now,
    });
  }
  if (fresh.length === 0) return [];
  for (const r of fresh) await db.put("memories", r);
  emit({ ...state, records: [...state.records, ...fresh] });
  return fresh;
}

export async function updateRecord(id: string, patch: Partial<MemoryRecord>): Promise<void> {
  const rec = state.records.find((r) => r.id === id);
  if (!rec) return;
  const next = { ...rec, ...patch, updatedAt: Date.now() };
  await db.put("memories", next);
  emit({ ...state, records: state.records.map((r) => (r.id === id ? next : r)) });
}

export async function deleteRecord(id: string): Promise<void> {
  await db.del("memories", id);
  emit({ ...state, records: state.records.filter((r) => r.id !== id) });
}

/** 用进废退：检索命中的记录权重上升（不做时间衰减） */
export async function bumpHits(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = Date.now();
  const records = state.records.map((r) =>
    ids.includes(r.id) ? { ...r, hits: r.hits + 1, weight: r.weight + 1, updatedAt: now } : r
  );
  for (const r of records) if (ids.includes(r.id)) await db.put("memories", r);
  emit({ ...state, records });
}

/* ---------- 未解决清单 ---------- */

export async function addUnresolved(charId: string, text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  if (state.unresolved.some((u) => u.text === t)) return;
  const item: UnresolvedItem = { id: uid(), charId, text: t.slice(0, 40), done: false, ts: Date.now(), updatedAt: Date.now() };
  await db.put("unresolved", item);
  emit({ ...state, unresolved: [...state.unresolved, item] });
}

export async function toggleUnresolved(id: string): Promise<void> {
  const item = state.unresolved.find((u) => u.id === id);
  if (!item) return;
  const next = { ...item, done: !item.done, updatedAt: Date.now() };
  await db.put("unresolved", next);
  emit({ ...state, unresolved: state.unresolved.map((u) => (u.id === id ? next : u)) });
}

export async function removeUnresolved(id: string): Promise<void> {
  await db.del("unresolved", id);
  emit({ ...state, unresolved: state.unresolved.filter((u) => u.id !== id) });
}

/* ---------- 会话线索 ---------- */

export async function saveThread(snapshot: ThreadSnapshot): Promise<void> {
  await db.put("threads", snapshot);
  emit({ ...state, threads: [...state.threads, snapshot] });
}

export function lastThread(): ThreadSnapshot | undefined {
  return state.threads[state.threads.length - 1];
}

/* ---------- 换窗召回（待注入，阅后即焚） ---------- */

export function setPendingRecall(block: string | null): void {
  if (state.pendingRecall === block) return;
  emit({ ...state, pendingRecall: block });
}

/** 取走待注入文本（取走后清空，只作用下一次请求） */
export function consumePendingRecall(): string | null {
  const block = state.pendingRecall;
  if (block !== null) emit({ ...state, pendingRecall: null });
  return block;
}

/* ---------- 清空当前角色（clearAll 用） ---------- */

export async function clearLatent(charId: string): Promise<void> {
  const mineRecs = scoped(await db.all<MemoryRecord>("memories"), charId);
  const mineUn = scoped(await db.all<UnresolvedItem>("unresolved"), charId);
  const mineTh = scoped(await db.all<ThreadSnapshot>("threads"), charId);
  await Promise.all([
    ...mineRecs.map((r) => db.del("memories", r.id)),
    ...mineUn.map((u) => db.del("unresolved", u.id)),
    ...mineTh.map((t) => db.del("threads", t.id)),
  ]);
  emit({ charId, records: [], unresolved: [], threads: [], pendingRecall: null });
}

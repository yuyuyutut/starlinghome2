/**
 * characters.ts — 多角色（聊天对象）数据层
 * 每个角色有独立的聊天记录、记忆、好感度、相识日期：
 *  - characters 仓库按 id 存角色卡（原有结构，天然支持多角色）
 *  - messages / memories 行带 charId；旧数据无 charId 的视为 "main"（启动时自动迁移）
 *  - 好感度、相识/上次访问时间等 meta 按 `${key}:${charId}` 命名空间隔离，旧全局键自动迁移
 *  - 当前角色 id 存 localStorage（starling.activeChar）
 */
import { db } from "@/lib/db";
import { DEFAULT_CHARACTER, type CharacterCard } from "./types";

const ACTIVE_KEY = "starling.activeChar";
/** 旧数据（单角色时期）统一归入的角色 id */
export const LEGACY_CHAR_ID = "main";

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadCharacters(): Promise<CharacterCard[]> {
  const list = await db.all<CharacterCard>("characters");
  return list.sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

/** 新建角色（默认模板），返回新角色卡（已入库） */
export async function createCharacter(name = "新伙伴"): Promise<CharacterCard> {
  const card: CharacterCard = { ...DEFAULT_CHARACTER, id: newId(), name };
  await db.put("characters", card);
  return card;
}

export function loadActiveCharId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function saveActiveCharId(id: string) {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    /* ignore */
  }
}

/** 旧消息/记忆行补 charId（单角色时期的数据归入 main） */
export async function migrateScopedRows(store: "messages" | "memories" | "unresolved" | "threads" | "facts" | "notes") {
  const rows = await db.all<{ id: string; charId?: string }>(store);
  for (const r of rows) {
    if (!r.charId) await db.put(store, { ...r, charId: LEGACY_CHAR_ID });
  }
}

export function scoped<T extends { charId?: string }>(rows: T[], charId: string): T[] {
  return rows.filter((r) => (r.charId ?? LEGACY_CHAR_ID) === charId);
}

/** 按角色隔离的 meta 读取；优先 `${key}:${charId}`，缺省回退旧全局键并迁移 */
export async function getCharMeta<T>(charId: string, key: string, fallback: T): Promise<T> {
  const row = await db.get<{ key: string; value: T }>("meta", `${key}:${charId}`);
  if (row) return row.value;
  const legacy = await db.get<{ key: string; value: T }>("meta", key);
  if (legacy) {
    await db.put("meta", { key: `${key}:${charId}`, value: legacy.value });
    return legacy.value;
  }
  return fallback;
}

export async function setCharMeta(charId: string, key: string, value: unknown) {
  await db.put("meta", { key: `${key}:${charId}`, value });
}

/** 删除角色卡及其全部关联数据（聊天记录/记忆/未了清单/会话线索/事实簿/便条/角色命名空间 meta），不可恢复 */
export async function deleteCharacter(id: string) {
  const stores = ["messages", "memories", "unresolved", "threads", "facts", "notes"] as const;
  for (const s of stores) {
    const rows = await db.all<{ id: string; charId?: string }>(s);
    for (const r of rows) {
      if ((r.charId ?? LEGACY_CHAR_ID) === id) await db.del(s, r.id);
    }
  }
  const metas = await db.all<{ key: string }>("meta");
  for (const m of metas) {
    if (m.key.endsWith(`:${id}`)) await db.del("meta", m.key);
  }
  await db.del("characters", id);
  if (loadActiveCharId() === id) saveActiveCharId("");
}

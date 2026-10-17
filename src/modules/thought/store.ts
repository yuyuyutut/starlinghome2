/**
 * thought/store.ts — 附言的存储与权限（对齐教程 read_thought / edit_thought）
 * · 归属检查：只能读/改当前角色窗口的 user 消息（教程里的 user_id 在本项目 = charId）
 * · 读取：首次成功取得正文才写 thoughtSeenAt，重读不改；已读是「工具取得正文并完成记账」
 * · 编辑：未读可改（旧文进 thoughtLog 归档），已读返回 409
 * · 单设备本地应用：IndexedDB 单连接事务天然串行，等价于 BEGIN IMMEDIATE 的交错防护
 */
import { db } from "@/lib/db";
import { LEGACY_CHAR_ID } from "../character/characters";
import { validateThoughtText } from "./mark";

export interface ThoughtMessageRow {
  id: string;
  role: "user" | "assistant";
  charId?: string;
  content: string;
  thought?: string;
  thoughtSeenAt?: number;
  thoughtLog?: string[];
  ts: number;
}

/**
 * 校验 message_id（教程收正整数；本项目消息 id 是 uuid，
 * 契约为：去掉开头的 # 后，6~64 位字母数字连字符）。
 */
export function parseMessageId(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/^#/, "");
  if (/^[A-Za-z0-9][A-Za-z0-9-]{5,63}$/.test(s)) return s;
  return null;
}

async function scopedUserMessage(id: string, charId: string): Promise<ThoughtMessageRow | null> {
  const row = await db.get<ThoughtMessageRow>("messages", id);
  if (!row) return null;
  if (row.role !== "user") return null;
  if ((row.charId ?? LEGACY_CHAR_ID) !== charId) return null;
  return row;
}

export type ReadThoughtResult = { ok: true; thought: string | null; firstRead: boolean } | { ok: false };

/** 读取附言：成功记账已读（只记第一次）；消息不存在/越权/无附言按契约返回 */
export async function readThoughtRecord(id: string, charId: string): Promise<ReadThoughtResult> {
  const row = await scopedUserMessage(id, charId);
  if (!row) return { ok: false };
  const text = row.thought?.trim();
  if (!text) return { ok: true, thought: null, firstRead: false };
  const firstRead = !row.thoughtSeenAt;
  if (firstRead) {
    await db.put("messages", { ...row, thoughtSeenAt: Date.now() });
  }
  return { ok: true, thought: text, firstRead };
}

/** 编辑附言：未读可改（旧文归档进 thoughtLog），已读锁定返回 409 */
export async function editThoughtRecord(
  id: string,
  charId: string,
  value: unknown
): Promise<{ status: 200 | 404 | 409 }> {
  const mid = parseMessageId(id);
  if (!mid) return { status: 404 };
  let text: string | null;
  try {
    text = validateThoughtText(value);
  } catch {
    return { status: 404 }; // 400 输入错误在调用方（UI）已拦，这里兜底
  }
  const row = await scopedUserMessage(mid, charId);
  if (!row) return { status: 404 };
  if (row.thoughtSeenAt) return { status: 409 };
  const log = [...(row.thoughtLog ?? [])];
  if (row.thought?.trim()) log.push(row.thought.trim()); // 归档旧文，可恢复
  await db.put("messages", { ...row, thought: text ?? undefined, thoughtLog: log });
  return { status: 200 };
}

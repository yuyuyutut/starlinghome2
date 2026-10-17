/**
 * latent/notes.ts — 便条（山屋页面上人唯一能写的东西）
 * 对齐原版 notes_state.py / 便条.jsonl：
 * · 只追加：你发现哪条记错了、哪件事已经变了，写一张便条锁进去
 * · TA 开场最先看到（latent_session_start 把未回便条放最前），改不改由 TA 自己判断，
 *   用 latent_note_reply 回一句认同/不认同——记忆只有 TA 能改，页面不给人绕过 TA 的修改按钮
 * · cleanup 的隔离备份也放这里（latent_cleanup 留档）
 */
import { db } from "@/lib/db";
import { scoped } from "@/modules/character/characters";
import type { MemoryRecord } from "./types";

export interface NoteReply {
  agree: boolean;
  text: string;
  ts: number;
}

export interface NoteItem {
  id: string;
  charId?: string;
  text: string;
  ts: number;
  reply?: NoteReply;
}

export interface CleanupBackup {
  record: MemoryRecord;
  reason: string;
  at: number;
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function notesOf(charId: string): Promise<NoteItem[]> {
  const all = await db.all<NoteItem>("notes");
  return scoped(all, charId).sort((a, b) => b.ts - a.ts);
}

export async function unrepliedNotes(charId: string): Promise<NoteItem[]> {
  return (await notesOf(charId)).filter((n) => !n.reply);
}

/** 写一张便条（只追加） */
export async function addNote(charId: string, text: string): Promise<void> {
  const t = text.trim();
  if (!t) return;
  await db.put("notes", { id: uid(), charId, text: t.slice(0, 300), ts: Date.now() });
}

/** TA 回便条：记认同或不认同，回一句话 */
export async function replyNote(noteId: string, agree: boolean, text: string): Promise<boolean> {
  const all = await db.all<NoteItem>("notes");
  const note = all.find((n) => n.id === noteId && !n.reply);
  if (!note) return false;
  await db.put("notes", { ...note, reply: { agree, text: text.trim().slice(0, 200), ts: Date.now() } });
  return true;
}

/** latent_cleanup 的隔离备份（最多留 20 份，超出丢弃最旧） */
export async function backupCleanup(record: MemoryRecord, reason: string): Promise<void> {
  const row = await db.get<{ key: string; value: CleanupBackup[] }>("meta", "latent.cleanup.backup");
  const list = row?.value ?? [];
  list.push({ record, reason, at: Date.now() });
  await db.put("meta", { key: "latent.cleanup.backup", value: list.slice(-20) });
}

export async function cleanupBackups(): Promise<CleanupBackup[]> {
  const row = await db.get<{ key: string; value: CleanupBackup[] }>("meta", "latent.cleanup.backup");
  return row?.value ?? [];
}

/** 未回便条的宿主侧注入块（latent_ 工具不可用时用；工具可用时走 latent_session_start） */
export async function buildNotesBlock(charId: string): Promise<string | null> {
  const notes = await unrepliedNotes(charId);
  if (notes.length === 0) return null;
  const lines = notes.map((n, i) => `${i + 1}. [${n.id.slice(0, 8)}] ${n.text}`);
  return [
    "[显影 · 便条]",
    "TA 在山屋给你留了便条——记忆只有你能改，认同与否、怎么改由你判断，回一句吧：",
    ...lines,
  ].join("\n");
}

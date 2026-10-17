/**
 * settings/backup.ts — 备份导出 / 导入
 * 导出内容：角色卡、聊天记录、记忆、元数据（好感度、相识日期等）。
 * 明确不含 settings（API Key 只在浏览器 localStorage，绝不进备份文件）。
 */
import { db } from "@/lib/db";

interface BackupFile {
  app: "starling-home";
  version: 1;
  exportedAt: number;
  characters: unknown[];
  messages: unknown[];
  memories: unknown[];
  meta: { key: string; value: unknown }[];
}

export async function buildBackup(): Promise<BackupFile> {
  const [characters, messages, memories, metaRows] = await Promise.all([
    db.all("characters"),
    db.all("messages"),
    db.all("memories"),
    db.all<{ key: string; value: unknown }>("meta"),
  ]);
  return {
    app: "starling-home",
    version: 1,
    exportedAt: Date.now(),
    characters,
    messages,
    memories,
    meta: metaRows,
  };
}

export function downloadBackup(data: BackupFile) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  a.href = url;
  a.download = `星语小屋备份-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 导入：覆盖式恢复（先清空四个仓库再写入），成功后由调用方刷新页面 */
export async function importBackup(file: File): Promise<{ messages: number; memories: number }> {
  const text = await file.text();
  let data: BackupFile;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("文件不是有效的 JSON");
  }
  if (data.app !== "starling-home" || !Array.isArray(data.messages) || !Array.isArray(data.memories)) {
    throw new Error("文件格式不对，请选择星语小屋的备份文件");
  }

  await Promise.all([db.clear("characters"), db.clear("messages"), db.clear("memories"), db.clear("meta")]);
  const writers: Promise<unknown>[] = [];
  for (const c of data.characters ?? []) writers.push(db.put("characters", c));
  for (const m of data.messages) writers.push(db.put("messages", m));
  for (const m of data.memories) writers.push(db.put("memories", m));
  for (const row of data.meta ?? []) writers.push(db.put("meta", row));
  await Promise.all(writers);

  return { messages: data.messages.length, memories: data.memories.length };
}

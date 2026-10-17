/**
 * latent/ledger.ts — 变迁链与撤回账本
 * · 事实变了：不改旧记录，新建一条并双向挂链（旧.supersededBy → 新，新.supersedes → 旧）
 *   检索默认不再返回旧值；查「以前/曾经」时整链放开
 * · 记错了：标记 corrected，任何检索都不再返回；可在「已撤回」分区恢复
 */
import { addRecords, updateRecord, useLatent } from "./store";
import type { MemoryRecord, RecordDraft } from "./types";

/**
 * 登记变迁：以 newDraft 为新值取代 old 记录，建立双向链。
 * 返回新记录 id。
 */
export async function supersedeRecord(charId: string, old: MemoryRecord, newDraft: RecordDraft): Promise<string | null> {
  const fresh = await addRecords(charId, [
    { ...newDraft, status: newDraft.status.trim() || "当下仍有效" },
  ]);
  // 去重时复用已存在的同文记录，链照样挂上去
  let target: MemoryRecord | undefined = fresh[0];
  if (!target) {
    const title = newDraft.title.trim().slice(0, 20) || newDraft.body.trim().slice(0, 12);
    const body = newDraft.body.trim();
    target = useLatent().records.find((r) => r.charId === charId && r.title === title && r.body === body);
  }
  if (!target) return null;
  await updateRecord(old.id, { supersededBy: target.id, statusKind: "changed" });
  await updateRecord(target.id, { supersedes: old.id });
  return target.id;
}

/** 撤回：记错的记录不再被检索返回（账本保留，可恢复） */
export async function correctRecord(id: string): Promise<void> {
  await updateRecord(id, { corrected: true });
}

/** 恢复撤回：重新进入检索 */
export async function restoreRecord(id: string): Promise<void> {
  await updateRecord(id, { corrected: false });
}

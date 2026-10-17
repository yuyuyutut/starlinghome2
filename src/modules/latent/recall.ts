/**
 * latent/recall.ts — 换窗召回（session start recall）
 * 隔了较久再打开、或切换角色后：把「上次聊到哪 + 仍未了的事 + 被想起最多的旧事」
 * 组装成历史快照，注入下一条请求——不是拿一段总结合并，冒充长期记忆。
 */
import type { MemoryRecord, ThreadSnapshot, UnresolvedItem } from "./types";

export interface RecallInput {
  /** 上一个窗口留下的快照（没有则为 undefined） */
  lastThread?: ThreadSnapshot;
  /** 仍未了的事项 */
  openItems: UnresolvedItem[];
  /** 被想起最多的记忆（按 weight 取 top） */
  topRecords: MemoryRecord[];
  /** 距上次见面的天数 */
  daysGap: number;
}

export function buildRecallBlock(input: RecallInput): string | null {
  const { lastThread, openItems, topRecords, daysGap } = input;
  if (!lastThread && openItems.length === 0 && topRecords.length === 0) return null;

  const lines: string[] = ["[显影 · 换窗召回]"];
  lines.push(`距你们上次见面已约 ${Math.max(1, daysGap)} 天。这是上个窗口留下的历史快照，是过去时，不是此刻正在发生的事：`);
  if (lastThread) {
    const when = new Date(lastThread.closedAt);
    const date = `${when.getMonth() + 1}月${when.getDate()}日`;
    lines.push(`· 上次聊到（${date}）：${lastThread.summary}`);
    if (lastThread.openCount > 0) lines.push(`· 上次分别时，还有 ${lastThread.openCount} 件事没有了结`);
  }
  if (openItems.length > 0) {
    lines.push("仍未了的事：");
    openItems.forEach((u, i) => lines.push(`${i + 1}. ${u.text}`));
  }
  if (topRecords.length > 0) {
    lines.push("被想起最多的旧事：");
    topRecords.forEach((r, i) => lines.push(`${i + 1}. 《${r.title}》${r.body} —— 当下：${r.status}`));
  }
  return lines.join("\n");
}

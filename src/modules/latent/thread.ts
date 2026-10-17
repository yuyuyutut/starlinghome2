/**
 * latent/thread.ts — 会话线索（thread close）
 * 「窗口」结束时把最后聊到的话存成历史快照：切换角色、清空聊天、
 * 以及页面隐藏超过阈值时都会触发。供换窗召回使用。
 */
import type { Msg } from "@/hooks/useCompanion";
import type { ThreadSnapshot } from "./types";

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 从消息流末尾提炼快照摘要（最后一条有内容的助手消息） */
export function summarizeTail(messages: Msg[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && m.content.trim()) return m.content.trim().slice(0, 120);
  }
  return null;
}

/** 组装一条会话线索快照；没有可记录的内容时返回 null */
export function buildSnapshot(charId: string, messages: Msg[], openCount: number): ThreadSnapshot | null {
  const summary = summarizeTail(messages);
  if (!summary) return null;
  return { id: uid(), charId, summary, openCount, closedAt: Date.now() };
}

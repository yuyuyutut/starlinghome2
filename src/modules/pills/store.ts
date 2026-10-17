/**
 * pills/store.ts — 挂药状态（模块级，跨「应用」面板与聊天页共享）
 * 语义与 pilulier 约定一致：
 *  - 只作用于下一次回复：send 触发生成时一次性取走（consumePills），不自动复用；
 *  - 发出即算吃掉：取走后重新生成也不会再吃一次，想再吃就重新挂；
 *  - 阅后即焚：药丸只进入那一次请求的 user 消息，聊天记录里永远不出现。
 */
import { useSyncExternalStore } from "react";
import { MAX_PILLS, pillByCode } from "./pills";

export interface AttachedPill {
  code: string;
  name: string;
}

let attached: AttachedPill[] = [];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

/** 挂一颗药到下一句话；返回提示语（null 表示成功） */
export function attachPill(code: string): string | null {
  const p = pillByCode(code);
  if (!p) return "这颗药不存在";
  if (attached.some((a) => a.code === code)) return "这颗药已经挂上了";
  if (attached.length >= MAX_PILLS) return `一次最多挂 ${MAX_PILLS} 颗`;
  attached = [...attached, { code: p.code, name: p.name }];
  emit();
  return null;
}

/** 放回一颗药 */
export function detachPill(code: string) {
  attached = attached.filter((a) => a.code !== code);
  emit();
}

/** 全部放回 */
export function clearPills() {
  if (attached.length === 0) return;
  attached = [];
  emit();
}

/** 发出即算吃掉：取走当前挂着的药（send 触发生成时调用一次） */
export function consumePills(): AttachedPill[] {
  const taken = attached;
  if (taken.length > 0) {
    attached = [];
    emit();
  }
  return taken;
}

/** 当前挂着的药（ChatPage  chips、应用面板共用） */
export function useAttachedPills(): AttachedPill[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => attached
  );
}

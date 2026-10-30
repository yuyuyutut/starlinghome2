/**
 * body/store.ts — 生理状态的按角色持久化 + 模块级响应式存储
 * 与 latent/store 同构：模块级外部存储 + useSyncExternalStore；
 * 状态体积小且要同步读写，存 localStorage（starling.body.<charId>）。
 *
 * Required Notice: Copyright 2026 Chuli (@chuli1122)
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 */

import { useSyncExternalStore } from "react";
import { BODY_FIELDS } from "./config";
import { advanceState, createInitialState, type BodyState } from "./engine";
import { renderStateCard } from "./card";
import { maybeTriggerEvent, type TriggerContext } from "./triggers";

function keyOf(charId: string): string {
  return `starling.body.${charId}`;
}

const cache = new Map<string, BodyState>();
const listeners = new Set<() => void>();

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

function emit(charId: string) {
  listeners.forEach((l) => l());
  persist(charId);
}

function persist(charId: string) {
  const state = cache.get(charId);
  if (!state) return;
  try {
    localStorage.setItem(keyOf(charId), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** 同步读取（localStorage 直读；没有则创建初始平稳期状态） */
export function loadBodyState(charId: string): BodyState {
  const hit = cache.get(charId);
  if (hit) return hit;
  let state: BodyState | null = null;
  try {
    const raw = localStorage.getItem(keyOf(charId));
    if (raw) {
      const parsed = JSON.parse(raw) as BodyState;
      // 兼容兜底：补齐缺字段
      if (parsed && typeof parsed === "object" && parsed.values) {
        const values = {} as BodyState["values"];
        for (const f of BODY_FIELDS) values[f] = Number(parsed.values[f] ?? 0);
        state = {
          cycleKey: String(parsed.cycleKey ?? "stable"),
          cycleStartedAt: Number(parsed.cycleStartedAt ?? Date.now()),
          cycleMinExpiresAt: Number(parsed.cycleMinExpiresAt ?? Date.now()),
          cycleExpiresAt: Number(parsed.cycleExpiresAt ?? Date.now()),
          values,
          activeEventKey: parsed.activeEventKey ?? null,
          activeEventStartedAt: parsed.activeEventStartedAt ?? null,
          activeEventExpiresAt: parsed.activeEventExpiresAt ?? null,
          lastTickAt: Number(parsed.lastTickAt ?? Date.now()),
          meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : {},
        };
      }
    }
  } catch {
    /* ignore */
  }
  if (!state) state = createInitialState(Date.now());
  cache.set(charId, state);
  return state;
}

/** 面板 UI 订阅用：当前角色的身体状态 */
export function useBody(charId: string): BodyState {
  return useSyncExternalStore(subscribe, () => loadBodyState(charId));
}

/** 手动重置（设置里可扩展） */
export function resetBodyState(charId: string): BodyState {
  const state = createInitialState(Date.now());
  cache.set(charId, state);
  emit(charId);
  return state;
}

export interface AdvanceOptions {
  /** 本轮用户消息正文（事件触发用） */
  text: string;
  /** 称呼 / 触发词（逗号分隔字符串） */
  triggerWords: string;
  /** 对方上一条消息时间戳 */
  lastCounterpartMessageAt: number | null;
  /** 是否注入状态卡（false 只 tick 不渲染） */
  inject: boolean;
}

function parseTriggerWords(raw: string): string[] {
  return raw
    .split(/[,，、\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 发消息前的完整流程（对齐 Eventide 接入顺序）：
 * tick 推进 → 事件触发检查 → 渲染状态卡。返回状态卡文本（未注入为 null）。
 */
export function advanceBodyForChar(charId: string, opts: AdvanceOptions): string | null {
  const now = Date.now();
  const state = loadBodyState(charId);

  // 1. 按当前时间推进
  advanceState(state, now, opts.lastCounterpartMessageAt);

  // 2. 事件触发（10 分钟节流在内部）
  const ctx: TriggerContext = {
    text: opts.text,
    triggerWords: parseTriggerWords(opts.triggerWords),
    lastCounterpartMessageAt: opts.lastCounterpartMessageAt,
    now,
  };
  maybeTriggerEvent(state, ctx);

  // 3. 渲染状态卡（隐藏上下文）
  const card = opts.inject ? renderStateCard(state, now) : null;

  emit(charId);
  return card;
}

/** 面板打开时只做时间推进（不抽事件、不渲染卡） */
export function tickBodyForChar(charId: string, lastCounterpartMessageAt: number | null): BodyState {
  const now = Date.now();
  const state = loadBodyState(charId);
  advanceState(state, now, lastCounterpartMessageAt);
  emit(charId);
  return state;
}

/** 角色删除时清掉对应状态 */
export function clearBodyState(charId: string) {
  cache.delete(charId);
  try {
    localStorage.removeItem(keyOf(charId));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

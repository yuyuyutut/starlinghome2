/**
 * body/engine.ts — 生理时间推进引擎
 *
 * advanceState 只做时间推进：分段 tick（每段 ≤6h，最多 48 段），
 * 顺序：事件过期(end_deltas) → 周期过期(next_key；ebb+fatigue>=70→recovery)
 * → 蓄积感增长 → 各值向周期目标靠近 → 疲惫感回落（受沉默时长影响）
 * → 事件 tick_deltas → 等待压力（久未回应推高压抑/占有欲）。
 */

import {
  APPROACH_FACTORS,
  BODY_FIELDS,
  BODY_FIELD_DEFS,
  CYCLES,
  EVENTS,
  INITIAL_VALUES,
  MAX_TICK_HOURS,
  MAX_TICK_SEGMENTS,
  type BodyFieldKey,
} from "./config";

/** 运行时唯一必须持久化的核心状态（毫秒时间戳版，对齐 models.BodyState） */
export interface BodyState {
  cycleKey: string;
  cycleStartedAt: number;
  cycleMinExpiresAt: number;
  cycleExpiresAt: number;
  values: Record<BodyFieldKey, number>;
  activeEventKey: string | null;
  activeEventStartedAt: number | null;
  activeEventExpiresAt: number | null;
  lastTickAt: number;
  /** 宿主侧运行时字段（节流 / 窗口去重 / 触发历史，不进模型上下文） */
  meta: Record<string, unknown>;
}

export type BodyDeltas = Partial<Record<BodyFieldKey, number>>;

const HOUR = 3600_000;
const MIN = 60_000;

function cycleOf(key: string) {
  return CYCLES[key] ?? CYCLES.stable;
}

export function clampBodyValue(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function clampBodyField(field: BodyFieldKey, value: number): number {
  return Math.max(BODY_FIELD_DEFS[field].minimum, clampBodyValue(value));
}

/** 进入周期：在 durationHours 范围内随机抽一个持续时间（对齐 enter_cycle） */
export function enterCycle(state: BodyState, cycleKey: string, now: number, reason = "cycle_expired") {
  const cycle = cycleOf(cycleKey);
  const [minH, maxH] = cycle.durationHours;
  const durationHours = minH + Math.random() * (maxH - minH);
  state.cycleKey = cycle.key;
  state.cycleStartedAt = now;
  state.cycleMinExpiresAt = now + minH * HOUR;
  state.cycleExpiresAt = now + durationHours * HOUR;
  state.meta.last_cycle_reason = reason;
}

/** 创建初始状态：平稳期 + 立刻抽取持续时间（对齐 create_initial_state） */
export function createInitialState(now: number, cycleKey = "stable"): BodyState {
  const state: BodyState = {
    cycleKey,
    cycleStartedAt: now,
    cycleMinExpiresAt: now,
    cycleExpiresAt: now,
    values: { ...INITIAL_VALUES },
    activeEventKey: null,
    activeEventStartedAt: null,
    activeEventExpiresAt: null,
    lastTickAt: now,
    meta: {},
  };
  enterCycle(state, cycleKey, now, "initial");
  return state;
}

/** 事件开始：已有未过期事件时返回 false 不覆盖（对齐 start_event） */
export function startEvent(state: BodyState, eventKey: string, now: number): boolean {
  if (state.activeEventKey && state.activeEventExpiresAt && now < state.activeEventExpiresAt) return false;
  const event = EVENTS[eventKey];
  if (!event) return false;
  const [minM, maxM] = event.durationMinutes;
  const durationMinutes = Math.floor(minM + Math.random() * (maxM - minM + 1));
  state.activeEventKey = event.key;
  state.activeEventStartedAt = now;
  state.activeEventExpiresAt = now + durationMinutes * MIN;
  return true;
}

/** 互动结算直写：逐字段 clamp，返回实际生效的 delta（对齐 apply_interaction_delta） */
export function applyInteractionDelta(state: BodyState, deltas: BodyDeltas): BodyDeltas {
  const applied: BodyDeltas = {};
  for (const field of BODY_FIELDS) {
    const delta = deltas[field];
    if (delta === undefined) continue;
    const nextValue = clampBodyField(field, state.values[field] + delta);
    applied[field] = nextValue - state.values[field];
    state.values[field] = nextValue;
  }
  return applied;
}

function finishExpiredEventIfNeeded(state: BodyState, now: number) {
  if (!state.activeEventKey || !state.activeEventExpiresAt) return;
  if (now < state.activeEventExpiresAt) return;
  const event = EVENTS[state.activeEventKey];
  if (event) applyInteractionDelta(state, event.endDeltas);
  state.meta.last_active_event_key = state.activeEventKey;
  state.activeEventKey = null;
  state.activeEventStartedAt = null;
  state.activeEventExpiresAt = null;
}

function advanceCycleIfNeeded(state: BodyState, now: number) {
  while (state.cycleExpiresAt && now >= state.cycleExpiresAt) {
    const current = cycleOf(state.cycleKey);
    let nextKey = current.nextKey;
    if (current.key === "ebb" && (state.values.fatigue ?? 0) >= 70 && CYCLES.recovery) {
      nextKey = "recovery";
    }
    enterCycle(state, nextKey, state.cycleExpiresAt);
  }
}

function fatigueReliefFactor(segmentEnd: number, lastCounterpartMessageAt: number | null): number {
  if (!lastCounterpartMessageAt) return 0.12;
  const silenceMinutes = (segmentEnd - lastCounterpartMessageAt) / MIN;
  if (silenceMinutes < 30) return 0.12;
  if (silenceMinutes < 120) return 0.16;
  if (silenceMinutes < 360) return 0.22;
  return 0.3;
}

function applyWaitingPressure(
  state: BodyState,
  elapsedHours: number,
  segmentEnd: number,
  lastCounterpartMessageAt: number | null
) {
  if (!lastCounterpartMessageAt) return;
  const silenceMinutes = (segmentEnd - lastCounterpartMessageAt) / MIN;
  if (silenceMinutes < 30) return;
  let pressureRate: number;
  let possessiveRate: number;
  let controlRate: number;
  if (silenceMinutes < 60) {
    pressureRate = 0.8;
    possessiveRate = 0.3;
    controlRate = 0;
  } else if (silenceMinutes < 120) {
    pressureRate = 1.5;
    possessiveRate = 0.6;
    controlRate = 0;
  } else {
    pressureRate = 2.0;
    possessiveRate = 0.9;
    controlRate = -0.6;
  }
  state.values.pressure = clampBodyField("pressure", state.values.pressure + pressureRate * elapsedHours);
  state.values.possessiveness = clampBodyField(
    "possessiveness",
    state.values.possessiveness + possessiveRate * elapsedHours
  );
  state.values.control = clampBodyField("control", state.values.control + controlRate * elapsedHours);
}

function advanceValues(
  state: BodyState,
  elapsedHours: number,
  segmentEnd: number,
  lastCounterpartMessageAt: number | null
) {
  const cycle = cycleOf(state.cycleKey);
  for (const field of BODY_FIELDS) {
    if (field === "reserve") {
      state.values[field] = clampBodyField(field, state.values[field] + cycle.reserveGrowth * elapsedHours);
      continue;
    }
    if (field === "fatigue") {
      const current = state.values[field];
      const target = cycle.targets.fatigue ?? 15;
      if (current <= target) {
        state.values[field] = clampBodyField(field, current);
      } else {
        const factor = fatigueReliefFactor(segmentEnd, lastCounterpartMessageAt);
        const ratio = Math.max(0, Math.min(1, factor * elapsedHours));
        state.values[field] = clampBodyField(field, current + (target - current) * ratio);
      }
      continue;
    }
    const target = cycle.targets[field] ?? state.values[field];
    const factor = APPROACH_FACTORS[field] ?? 0.15;
    state.values[field] = clampBodyField(field, state.values[field] + (target - state.values[field]) * factor * elapsedHours);
  }

  applyWaitingPressure(state, elapsedHours, segmentEnd, lastCounterpartMessageAt);

  if (state.activeEventKey) {
    const event = EVENTS[state.activeEventKey];
    if (event) {
      for (const field of BODY_FIELDS) {
        const rate = event.tickDeltas[field];
        if (rate === undefined) continue;
        state.values[field] = clampBodyField(field, state.values[field] + rate * elapsedHours);
      }
    }
  }
}

/**
 * 按时间推进状态（对齐 advance_state）。
 * now <= lastTickAt 时不推进只更新时间戳；返回本轮是否有数值变化。
 */
export function advanceState(
  state: BodyState,
  now: number,
  lastCounterpartMessageAt: number | null = null
): boolean {
  const lastTickAt = state.lastTickAt || now;
  if (now <= lastTickAt) {
    state.lastTickAt = now;
    return false;
  }

  let changed = false;
  let cursor = lastTickAt;
  let segments = 0;
  const maxStep = MAX_TICK_HOURS * HOUR;

  while (cursor < now && segments < MAX_TICK_SEGMENTS) {
    finishExpiredEventIfNeeded(state, cursor);
    advanceCycleIfNeeded(state, cursor);

    let segmentEnd = Math.min(now, cursor + maxStep);
    for (const boundary of [state.cycleExpiresAt, state.activeEventExpiresAt]) {
      if (boundary && cursor < boundary && boundary < segmentEnd) segmentEnd = boundary;
    }

    const elapsedHours = Math.max(0, (segmentEnd - cursor) / HOUR);
    if (elapsedHours > 0) {
      advanceValues(state, elapsedHours, segmentEnd, lastCounterpartMessageAt);
      changed = true;
    }
    cursor = segmentEnd;
    state.lastTickAt = cursor;
    segments += 1;
  }

  if (cursor >= now) state.lastTickAt = now;
  return changed;
}

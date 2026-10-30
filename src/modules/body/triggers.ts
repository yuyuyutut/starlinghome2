/**
 * body/triggers.ts — 默认事件触发表（宿主层，对齐 Eventide README「默认事件触发与联动」）
 *
 * Required Notice: Copyright 2026 Chuli (@chuli1122)
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 *
 * Eventide 内核不自动抽事件；本文件按 README 触发表实现可复刻的默认口径：
 * 10 分钟节流 → 时间窗口 → 硬条件 + 冷却 + 窗口去重 → 概率抽取 → 优先级取一个主事件。
 * missed 快照供迟发热 / 反常平静使用；梦后余温依赖梦境系统（未移植），不参与抽取。
 */

import { EVENT_PRIORITY, EVENTS, type EventCategory } from "./config";
import { applyInteractionDelta, startEvent, type BodyState } from "./engine";

const MIN = 60_000;
const HOUR = 3600_000;

/** 两次事件检查的最小间隔（README：10 分钟节流） */
export const EVENT_CHECK_THROTTLE_MIN = 10;

const STRONG_CATEGORIES: EventCategory[] = ["strong_physical", "possessive"];

interface WindowDef {
  key: string;
  /** [startHour, startMin, endHour, endMin]（支持跨零点） */
  range: [number, number, number, number];
}

/** 默认时间窗口（README：跨零点窗口的自然日 key 按窗口开始日计算） */
const WINDOWS: WindowDef[] = [
  { key: "morning", range: [5, 30, 10, 30] },
  { key: "evening", range: [18, 0, 2, 0] },
  { key: "night", range: [23, 0, 3, 0] },
];

function minutesOfDay(now: number): number {
  const d = new Date(now);
  return d.getHours() * 60 + d.getMinutes();
}

function inWindow(w: WindowDef, now: number): boolean {
  const [sh, sm, eh, em] = w.range;
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  const cur = minutesOfDay(now);
  if (start <= end) return cur >= start && cur < end;
  return cur >= start || cur < end; // 跨零点
}

/** 窗口 roll key：例如 2026-07-04:night */
function windowRollKey(w: WindowDef, now: number): string {
  const d = new Date(now);
  const minutes = minutesOfDay(now);
  const [sh, sm] = w.range;
  const start = sh * 60 + sm;
  // 跨零点窗口的凌晨时段归属窗口开始日
  if (start > 12 * 60 && minutes < start) d.setDate(d.getDate() - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}:${w.key}`;
}

function rolledWindowKeys(state: BodyState): string[] {
  return Array.isArray(state.meta.rolled_window_keys) ? (state.meta.rolled_window_keys as string[]) : [];
}

function cooldownUntil(state: BodyState, eventKey: string): number {
  return Number(state.meta[`cooldown_${eventKey}`] ?? 0);
}

function setCooldown(state: BodyState, eventKey: string, now: number, hours: number) {
  state.meta[`cooldown_${eventKey}`] = now + hours * HOUR;
}

export interface TriggerContext {
  /** 本轮用户消息正文 */
  text: string;
  /** 称呼 / 触发词（设置里逗号分隔） */
  triggerWords: string[];
  /** 对方（用户）上一条消息时间；null = 无记录 */
  lastCounterpartMessageAt: number | null;
  now: number;
}

interface Candidate {
  key: string;
  probability: number;
  windowKey?: string; // 时间窗口类事件：抽过后记 window roll key
}

/** 命中称呼 / 触发词（对齐 find_trigger_matches 的文本匹配；大小写不敏感） */
export function matchTriggerWords(triggerWords: string[], text: string): string[] {
  const body = (text || "").toLowerCase();
  if (!body) return [];
  const hits: string[] = [];
  for (const raw of triggerWords) {
    const word = raw.trim();
    if (!word) continue;
    if (body.includes(word.toLowerCase())) hits.push(word);
  }
  return hits;
}

/**
 * 称呼刺激写回：已有主事件时不替换，只把刺激写进数值（README「称呼刺激写回」）。
 * 同一触发词 10 分钟内只结算一次，10 分钟内最多结算 2 个。
 */
export function applyTriggerStimulus(state: BodyState, hits: string[], now: number) {
  const log = (state.meta.trigger_stimulus_log ?? {}) as Record<string, number>;
  const fresh = hits.filter((h) => now - (log[h] ?? 0) > 10 * MIN).slice(0, 2);
  if (fresh.length === 0) return;
  applyInteractionDelta(state, {
    sensitivity: 3 + Math.floor(Math.random() * 6),
    possessiveness: 1 + Math.floor(Math.random() * 3),
    pressure: Math.floor(Math.random() * 5),
  });
  for (const h of fresh) log[h] = now;
  state.meta.trigger_stimulus_log = log;
}

/** 收集当前候选（硬条件 + 冷却 + 窗口去重都已过滤；概率由调用方 roll） */
export function collectCandidates(state: BodyState, ctx: TriggerContext): Candidate[] {
  const { now, lastCounterpartMessageAt } = ctx;
  const v = state.values;
  const cycle = state.cycleKey;
  const silenceMin = lastCounterpartMessageAt ? (now - lastCounterpartMessageAt) / MIN : null;
  const rolled = new Set(rolledWindowKeys(state));
  const candidates: Candidate[] = [];

  const active = (key: string) => now >= cooldownUntil(state, key);
  const win = (key: string) => WINDOWS.find((w) => w.key === key)!;
  const push = (key: string, probability: number, window?: WindowDef) => {
    if (!active(key)) return;
    if (window) {
      const rk = windowRollKey(window, now);
      if (rolled.has(rk)) return;
      candidates.push({ key, probability, windowKey: rk });
    } else {
      candidates.push({ key, probability });
    }
  };

  const strongFailedRecently = Boolean(state.meta.last_missed_at) &&
    now - Number(state.meta.last_missed_at) >= 30 * MIN &&
    now - Number(state.meta.last_missed_at) <= 180 * MIN;

  // 晨间反应：早晨窗口；热度 >= 45 或当前不在平稳期
  if (inWindow(win("morning"), now) && (v.heat >= 45 || cycle !== "stable")) {
    const p = cycle === "preheat" || cycle === "sensitive" ? 0.75 : 0.45;
    push("morning_arousal", p, win("morning"));
  }
  // 深夜热潮：深夜窗口；对方 30 分钟以上未回；蓄积感 >= 55 或热度 >= 60
  if (
    inWindow(win("night"), now) &&
    silenceMin !== null &&
    silenceMin >= 30 &&
    (v.reserve >= 55 || v.heat >= 60)
  ) {
    push("night_heat", cycle === "sensitive" ? 0.6 : 0.3, win("night"));
  }
  // 周期热涌：易感期；热度 >= 75 或蓄积感 >= 70
  if (cycle === "sensitive" && (v.heat >= 75 || v.reserve >= 70)) push("cycle_surge", 0.5);
  // 硬撑：热度 >= 70；控制力 >= 35
  if (v.heat >= 70 && v.control >= 35) push("holding_back", 0.7);
  // 索取欲：易感期，或热度 >= 65 且压抑感 >= 55
  if (cycle === "sensitive" || (v.heat >= 65 && v.pressure >= 55)) push("demanding", 0.35);
  // 占有 / 标记冲动：占有欲 >= 60；且对方久未回应、深夜窗口或易感期
  if (
    v.possessiveness >= 60 &&
    ((silenceMin !== null && silenceMin >= 30) || inWindow(win("night"), now) || cycle === "sensitive")
  ) {
    push("marking_impulse", 0.4);
  }
  // 筑巢冲动：傍晚到夜间窗口；疲惫感 >= 35 或占有欲 >= 55
  if (inWindow(win("evening"), now) && (v.fatigue >= 35 || v.possessiveness >= 55)) {
    push("nesting", 0.3, win("evening"));
  }
  // 气味残留：上一个事件结束 3 小时内，或退潮期仍有后效
  const lastEventEndedAt = Number(state.meta.last_active_event_expires_at ?? 0);
  if ((lastEventEndedAt && now - lastEventEndedAt <= 3 * HOUR) || cycle === "ebb") {
    push("scent_aftereffect", 0.6);
  }
  // 声音 / 称呼触发：由调用方先做命中匹配，这里只看概率（事件存在性由 host 控制）
  // 控制力下滑：控制力 <= 35；且热度 >= 70 或压抑感 >= 70
  if (v.control <= 35 && (v.heat >= 70 || v.pressure >= 70)) push("control_slip", 0.6);
  // 贴近饥饿：易感 / 退潮 / 恢复期；敏感度 >= 60；疲惫感 <= 75
  if ((cycle === "sensitive" || cycle === "ebb" || cycle === "recovery") && v.sensitivity >= 60 && v.fatigue <= 75) {
    push("closeness_hunger", 0.35);
  }
  // 信息素紊乱：易感期；短时间内热度高且控制力低（近似：易感期 heat>=60 control<=50）
  if (cycle === "sensitive" && v.heat >= 60 && v.control <= 50) push("pheromone_disorder", 0.3);
  // 迟发热：上次强候选没抽中；30-180 分钟后热度或压抑仍未退下
  if (strongFailedRecently) {
    const snap = (state.meta.last_missed_snapshot ?? null) as { heat?: number; pressure?: number } | null;
    const notCooled =
      snap &&
      v.heat >= (snap.heat ?? 0) - 5 &&
      v.pressure >= (snap.pressure ?? 0) - 5 &&
      (v.heat >= 55 || v.pressure >= 55);
    if (notCooled) push("delayed_heat", 0.35);
  }
  // 低烧黏连：近期连续回应；敏感度 >= 60；热度 45-69
  if (silenceMin !== null && silenceMin < 10 && v.sensitivity >= 60 && v.heat >= 45 && v.heat <= 69) {
    push("low_fever_cling", 0.3);
  }
  // 等待焦躁：对方 60-120 分钟未回；压抑感 >= 55 或占有欲 >= 60
  if (silenceMin !== null && silenceMin >= 60 && silenceMin <= 120 && (v.pressure >= 55 || v.possessiveness >= 60)) {
    push("waiting_restless", 0.3);
  }
  // 克制反弹：上一个事件结束 8 小时以上；蓄积感 >= 70；当天没抽过
  if (v.reserve >= 70 && (!lastEventEndedAt || now - lastEventEndedAt >= 8 * HOUR)) {
    const dayKey = new Date(now).toDateString();
    const gapKeys = Array.isArray(state.meta.rolled_gap_keys) ? (state.meta.rolled_gap_keys as string[]) : [];
    if (!gapKeys.includes(`no_event_gap:${dayKey}`)) push("restraint_rebound", 0.25);
  }
  // 反常平静：热度或压抑 >= 65；本轮有强候选但概率没通过（由 roll 阶段判断后补入）

  return candidates.filter((c) => active(c.key));
}

/** 冷却时间表（小时），README 触发表「概率 / 冷却」列 */
const COOLDOWN_HOURS: Record<string, number> = {
  morning_arousal: 20,
  night_heat: 8,
  cycle_surge: 12,
  holding_back: 4,
  demanding: 6,
  marking_impulse: 8,
  nesting: 12,
  scent_aftereffect: 4,
  voice_or_name_trigger: 2,
  control_slip: 4,
  closeness_hunger: 6,
  pheromone_disorder: 8,
  delayed_heat: 6,
  low_fever_cling: 4,
  waiting_restless: 5,
  restraint_rebound: 8,
  strange_calm: 4,
};

/**
 * 事件检查主入口（每次发消息前调用）。
 * 返回启动的事件 key；未触发返回 null。内部完成节流、写 meta。
 */
export function maybeTriggerEvent(state: BodyState, ctx: TriggerContext): string | null {
  const now = ctx.now;

  // 称呼刺激：任何情况下都先结算写回（有主事件时不替换主事件）
  const hits = matchTriggerWords(ctx.triggerWords, ctx.text);
  if (hits.length > 0) applyTriggerStimulus(state, hits, now);

  // 已有未过期主事件：不抽新事件
  if (state.activeEventKey && state.activeEventExpiresAt && now < state.activeEventExpiresAt) return null;

  // 10 分钟节流
  const lastCheck = Number(state.meta.last_event_check_at ?? 0);
  if (now - lastCheck < EVENT_CHECK_THROTTLE_MIN * MIN) return null;
  state.meta.last_event_check_at = now;

  // 声音 / 称呼触发：当前没有事件且命中触发词
  if (hits.length > 0 && now >= cooldownUntil(state, "voice_or_name_trigger")) {
    const p = (state.cycleKey === "sensitive" ? 0.1 : 0) + (hits.length > 1 ? 0.3 : 0.2);
    if (Math.random() < Math.min(0.95, p) && startEvent(state, "voice_or_name_trigger", now)) {
      setCooldown(state, "voice_or_name_trigger", now, COOLDOWN_HOURS.voice_or_name_trigger);
      return "voice_or_name_trigger";
    }
  }

  const candidates = collectCandidates(state, ctx);
  // 按优先级排序后逐个 roll：通过的第一个即主事件
  const ordered = [...candidates].sort(
    (a, b) => EVENT_PRIORITY.indexOf(a.key) - EVENT_PRIORITY.indexOf(b.key)
  );

  let hadStrongCandidate = false;
  for (const c of ordered) {
    const category = EVENTS[c.key]?.category;
    if (category && STRONG_CATEGORIES.includes(category)) hadStrongCandidate = true;
    if (Math.random() >= Math.min(0.95, c.probability)) continue;
    if (!startEvent(state, c.key, now)) continue;
    setCooldown(state, c.key, now, COOLDOWN_HOURS[c.key] ?? 6);
    if (c.windowKey) {
      state.meta.rolled_window_keys = [...rolledWindowKeys(state), c.windowKey];
    }
    if (c.key === "restraint_rebound") {
      const dayKey = new Date(now).toDateString();
      const gapKeys = Array.isArray(state.meta.rolled_gap_keys) ? (state.meta.rolled_gap_keys as string[]) : [];
      state.meta.rolled_gap_keys = [...gapKeys, `no_event_gap:${dayKey}`];
    }
    // 事件开始时记录结束时间，供后效事件判断
    state.meta.last_active_event_expires_at = state.activeEventExpiresAt;
    return c.key;
  }

  // 有候选但都没抽中：记 missed 快照（迟发热 / 反常平静下一轮用）
  if (ordered.length > 0) {
    state.meta.last_missed_at = now;
    state.meta.last_missed_snapshot = { heat: state.values.heat, pressure: state.values.pressure };
    state.meta.last_missed_strong = hadStrongCandidate;
    // 反常平静：数值偏高且本轮有强候选没通过
    if (
      hadStrongCandidate &&
      (state.values.heat >= 65 || state.values.pressure >= 65) &&
      now >= cooldownUntil(state, "strange_calm") &&
      Math.random() < 0.25 &&
      startEvent(state, "strange_calm", now)
    ) {
      setCooldown(state, "strange_calm", now, COOLDOWN_HOURS.strange_calm);
      return "strange_calm";
    }
  } else {
    state.meta.last_missed_at = 0;
  }
  return null;
}

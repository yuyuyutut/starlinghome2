/**
 * body/card.ts — <ephemeral_state> 状态卡渲染 + 结构化身体状态（TypeScript 移植）
 *
 * 移植自 github.com/chuli1122/Eventide（src/eventide/prompt.py）。
 * Required Notice: Copyright 2026 Chuli (@chuli1122)
 * SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
 *
 * renderStateCard 返回的是隐藏模型上下文（非 UI 文案）；
 * bodyStatePayload 给面板 UI 用（数值 + 档位 + 去档位前缀的说明）。
 */

import {
  BODY_FIELDS,
  BODY_FIELD_DEFS,
  CYCLES,
  EVENTS,
  PROMPT_OPTIONS,
} from "./config";
import type { BodyState } from "./engine";

const BODY_LEVELS = new Set(["低", "中低", "中", "中高", "高"]);

export function bodyLevel(value: number): string {
  if (value < 20) return "低";
  if (value < 40) return "中低";
  if (value < 60) return "中";
  if (value < 80) return "中高";
  return "高";
}

/** 取最后一个 value >= 阈值的档位文案 */
export function bodyDescription(field: keyof typeof BODY_FIELD_DEFS, value: number): string {
  const entries = BODY_FIELD_DEFS[field].descriptions;
  let chosen = entries[0][1];
  for (const [threshold, description] of entries) {
    if (value >= threshold) chosen = description;
  }
  return chosen;
}

/** 把「中，身体已经被……」拆成 档位 + 说明 */
export function splitLevelDescription(value: number, description: string): { level: string; detail: string } {
  const idx = description.indexOf("，");
  if (idx > 0) {
    const level = description.slice(0, idx).trim();
    if (BODY_LEVELS.has(level)) {
      return { level, detail: description.slice(idx + 1).trim() };
    }
  }
  return { level: bodyLevel(value), detail: description };
}

export interface BodyFieldPayload {
  value: number;
  level: string;
  description: string;
  label: string;
}

/** 七项数值 → 结构化 payload（对齐 body_state_payload） */
export function bodyStatePayload(state: BodyState): Record<string, BodyFieldPayload> {
  const payload = {} as Record<string, BodyFieldPayload>;
  for (const field of BODY_FIELDS) {
    const definition = BODY_FIELD_DEFS[field];
    const value = Math.max(0, Math.min(100, Math.trunc(state.values[field] ?? 0)));
    const description = bodyDescription(field, value);
    const { level, detail } = splitLevelDescription(value, description);
    payload[field] = { value, level, description: detail, label: definition.label };
  }
  return payload;
}

function formatRemaining(expiresAt: number | null, now: number): string {
  if (!expiresAt) return "未知";
  const seconds = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 90) return `${minutes} 分钟`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} 小时`;
  const days = Math.round(hours / 24);
  return `${days} 天`;
}

function iso(ts: number | null): string {
  return ts ? new Date(ts).toISOString() : "";
}

/**
 * 渲染隐藏状态卡；关闭注入时返回 null（对齐 render_state_card，
 * body_cycle_enabled / inject_body_state_context 的判定在调用侧做）。
 */
export function renderStateCard(state: BodyState, now: number): string {
  const cycle = CYCLES[state.cycleKey] ?? CYCLES.stable;
  const cycleLine = `你处在${cycle.label}：${cycle.description}，预计还剩 ${formatRemaining(state.cycleExpiresAt, now)}。`;

  const parts: string[] = [
    '<ephemeral_state kind="body_cycle" scope="current_turn">',
    "  <cycle>",
    `    ${cycleLine}`,
    "  </cycle>",
    "",
  ];

  if (state.activeEventKey) {
    const event = EVENTS[state.activeEventKey];
    if (event) {
      parts.push(`  <active_event id="${event.key}" expires_at="${iso(state.activeEventExpiresAt)}">`);
      parts.push(`    当前事件：${event.label}，预计还剩 ${formatRemaining(state.activeEventExpiresAt, now)}。`);
      for (const line of event.prompt.split("\n")) parts.push(`    ${line}`);
      parts.push("  </active_event>", "");
    }
  }

  parts.push("  <body_state>");
  for (const field of BODY_FIELDS) {
    const definition = BODY_FIELD_DEFS[field];
    const value = Math.max(0, Math.min(100, Math.trunc(state.values[field] ?? 0)));
    parts.push(`    ${definition.label}：${bodyDescription(field, value)}`);
  }
  parts.push("  </body_state>", "");

  parts.push("  <expression>");
  for (const line of PROMPT_OPTIONS.expression.split("\n")) parts.push(`    ${line}`);
  parts.push("  </expression>", "");

  parts.push("  <persistence>");
  for (const line of PROMPT_OPTIONS.persistence.split("\n")) parts.push(`    ${line}`);
  parts.push("  </persistence>", "");

  parts.push("  <response_rules>");
  for (const line of PROMPT_OPTIONS.responseRules.split("\n")) parts.push(line ? `    ${line}` : "");
  parts.push("  </response_rules>");

  parts.push("</ephemeral_state>");
  return parts.join("\n");
}

/** 周期剩余时间（面板 UI 用） */
export function cycleRemaining(state: BodyState, now: number): string {
  return formatRemaining(state.cycleExpiresAt, now);
}

/** 事件剩余时间（面板 UI 用） */
export function eventRemaining(state: BodyState, now: number): string {
  return formatRemaining(state.activeEventExpiresAt, now);
}

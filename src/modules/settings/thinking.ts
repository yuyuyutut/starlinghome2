/**
 * settings/thinking.ts — 思考强度档位（设置页「Pensée」选择器的数据与请求组装）
 * 档位文案参考主流客户端的「推理强度」：关闭 / 不设限 / 轻度 / 中 / 高 / 极高 / 自定义。
 * 通过 OpenAI 兼容层透传 thinking 字段（budget_tokens），中转方需支持。
 */
import type { ThinkingLevel } from "@/lib/db";

export interface ThinkingOption {
  id: ThinkingLevel;
  zh: string;
  /** 档位说明（选择器里展示） */
  desc: string;
  /** 对应 thinking 预算；不设限/自定义为 undefined（custom 用 settings.thinkingBudget） */
  budget?: number;
}

export const THINKING_OPTIONS: ThinkingOption[] = [
  { id: "off", zh: "关闭", desc: "不主动发送思考预算。" },
  { id: "auto", zh: "不设限", desc: "不写具体预算，让当前线路和模型自己处理推理力度。" },
  { id: "low", zh: "轻度", desc: "短问题和快速草稿，少量思考。", budget: 2048 },
  { id: "medium", zh: "中", desc: "日常对话和普通写作，平衡速度与质量。", budget: 8192 },
  { id: "high", zh: "高", desc: "复杂写作、代码和需要多步推理的问题，给模型更多思考空间。", budget: 20000 },
  { id: "max", zh: "极高", desc: "困难推理和长任务，优先完整性。", budget: 64000 },
  { id: "custom", zh: "自定义", desc: "需要精确控制时再填具体预算；不同模型对预算的支持程度不同。" },
];

export function isThinkingOn(level: ThinkingLevel): boolean {
  return level !== "off";
}

/**
 * 组装 extraBody：
 *  - off    → undefined（完全不请求思维链）
 *  - auto   → { thinking: { type: "enabled" } }（不写预算）
 *  - 其他   → { thinking: { type: "enabled", budget_tokens: N } }（custom 用传入预算，最低 1024）
 */
export function thinkingExtraBody(level: ThinkingLevel, customBudget: number): Record<string, unknown> | undefined {
  if (level === "off") return undefined;
  if (level === "auto") return { thinking: { type: "enabled" } };
  const budget = level === "custom" ? Math.max(1024, customBudget) : THINKING_OPTIONS.find((o) => o.id === level)?.budget;
  return budget ? { thinking: { type: "enabled", budget_tokens: budget } } : { thinking: { type: "enabled" } };
}

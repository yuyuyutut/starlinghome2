/**
 * affection/affection.ts — 好感度 + 时段问候 + 纪念日的核心逻辑
 * 好感度用本地情感词打分（不消耗 API），想调整权重改 POSITIVE/NEGATIVE 即可。
 */

/* ---------------- 好感度 ---------------- */

export interface AffectionState {
  points: number;
}

export const AFFECTION_LEVELS: { min: number; name: string; emoji: string; mood: string }[] = [
  { min: 0, name: "初识", emoji: "🌱", mood: "有点拘谨" },
  { min: 15, name: "熟悉", emoji: "🌿", mood: "放松" },
  { min: 40, name: "亲近", emoji: "🌷", mood: "开心" },
  { min: 80, name: "信赖", emoji: "🌻", mood: "信赖你" },
  { min: 150, name: "心动", emoji: "💗", mood: "满心欢喜" },
];

export function levelOf(points: number) {
  let cur = AFFECTION_LEVELS[0];
  for (const l of AFFECTION_LEVELS) if (points >= l.min) cur = l;
  return cur;
}

const POSITIVE = ["谢谢", "感谢", "喜欢", "爱你", "想你", "抱抱", "亲", "好看", "好吃", "开心", "高兴", "棒", "厉害", "晚安", "早安", "么么", "想你"];
const NEGATIVE = ["滚", "烦", "讨厌", "闭嘴", "别理我", "难看", "难吃", "生气", "恨", "傻", "笨蛋", "闭嘴"];

/** 根据一条用户消息计算好感度变化（-3 ~ +3） */
export function scoreMessage(text: string): number {
  let delta = 0;
  for (const w of POSITIVE) if (text.includes(w)) delta += 1;
  for (const w of NEGATIVE) if (text.includes(w)) delta -= 2;
  if (text.length >= 30) delta += 1; // 愿意多聊
  return Math.max(-3, Math.min(3, delta));
}

/* ---------------- 时段问候 ---------------- */

export function greetingByHour(d = new Date()): string {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "早安";
  if (h >= 11 && h < 14) return "中午好";
  if (h >= 14 && h < 18) return "下午好";
  if (h >= 18 && h < 23) return "晚上好";
  return "夜深了";
}

export function timeDesc(d = new Date()): string {
  const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const h = d.getHours();
  const part = h < 6 ? "凌晨" : h < 12 ? "上午" : h < 14 ? "中午" : h < 18 ? "下午" : h < 23 ? "晚上" : "深夜";
  return `${days[d.getDay()]}的${part}`;
}

/* ---------------- 纪念日 ---------------- */

/** 距第一次聊天的天数（第一天算第 1 天） */
export function daysTogether(firstTs: number, now = Date.now()): number {
  const a = new Date(firstTs);
  a.setHours(0, 0, 0, 0);
  const b = new Date(now);
  b.setHours(0, 0, 0, 0);
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

/** 特殊的纪念日文案（整百天、周年） */
export function anniversaryText(days: number): string | null {
  if (days === 1) return "今天是你们相识的第 1 天 ✨";
  if (days % 365 === 0) return `今天是你们相识 ${days / 365} 周年的纪念日 🎉`;
  if (days % 100 === 0) return `今天是你们相识的第 ${days} 天，值得纪念 🎉`;
  return null;
}

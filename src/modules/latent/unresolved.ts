/**
 * latent/unresolved.ts — 未解决清单的自动察觉规则
 * 用户消息里出现「下次 / 到时候 / 说好了 / 改天」等字眼时，
 * 提议一条未解决事项；面板里可手动增删、勾掉。
 */

interface Rule {
  re: RegExp;
  build: (m: RegExpMatchArray) => string | null;
}

function trimEnd(s: string): string {
  return s.replace(/[。！？!?,，\s]+$/g, "").trim();
}

const RULES: Rule[] = [
  {
    re: /下次(.{1,20})/,
    build: (m) => `下次要一起：${trimEnd(m[1])}`,
  },
  {
    re: /(?:说好了|约好了|约好)(.{1,22})/,
    build: (m) => `说好了的事：${trimEnd(m[1])}`,
  },
  {
    re: /改天(.{1,18})/,
    build: (m) => `改天再约：${trimEnd(m[1])}`,
  },
  {
    re: /等(?:我|你|咱|我们)(?:有)?空(.{0,16})/,
    build: (m) => `等有空时${trimEnd(m[1]) || "再聊"}`,
  },
  {
    re: /(?:还没|没来得及)(.{1,18})/,
    build: (m) => `还没做完的事：${trimEnd(m[1])}`,
  },
];

/** 太短的消息不触发，避免「下次见」这类寒暄污染清单 */
const MIN_LEN = 5;

export function suggestUnresolved(text: string): string[] {
  const t = text.trim();
  if (t.length < MIN_LEN) return [];
  const out: string[] = [];
  for (const rule of RULES) {
    const m = t.match(rule.re);
    if (!m) continue;
    const item = rule.build(m);
    if (item && item.length >= 5) out.push(item.slice(0, 40));
  }
  return out;
}

/**
 * memory/extractor.ts — 从用户消息里自动提炼"值得记住的事"
 * 默认用本地规则（零成本、零延迟）；有 API Key 时也可以在面板上让 LLM 总结。
 * 想加新的记忆规则，往 RULES 里加一条正则即可。
 */

export interface MemoryDraft {
  content: string;
  source: "auto" | "manual" | "llm";
}

interface Rule {
  re: RegExp;
  build: (m: RegExpMatchArray) => string | null;
}

const RULES: Rule[] = [
  {
    re: /我叫([\u4e00-\u9fa5A-Za-z0-9_]{1,10})/,
    build: (m) => `TA 的名字叫「${m[1]}」`,
  },
  {
    re: /我喜欢(.{1,24})/,
    build: (m) => `TA 喜欢${trimEnd(m[1])}`,
  },
  {
    re: /我不喜欢(.{1,24})|我讨厌(.{1,24})/,
    build: (m) => `TA 不喜欢${trimEnd(m[1] ?? m[2] ?? "")}`,
  },
  {
    re: /(?:记住|记得)(.{2,30})/,
    build: (m) => `约定要记住的事：${trimEnd(m[1])}`,
  },
  {
    re: /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]([^。！？!?,，]{0,12})?/,
    build: (m) => {
      const note = m[3] ? `（${trimEnd(m[3])}）` : "";
      return `一个重要的日子：${m[1]}月${m[2]}日${note}`;
    },
  },
  {
    re: /我(?:今天|昨天|刚刚|最近)?(开心|难过|累|焦虑|烦|生气|失眠|生病)了?/,
    build: (m) => `TA 曾说起自己${m[1]}，多关心一下`,
  },
];

function trimEnd(s: string): string {
  return s.replace(/[。！？!?,，\s]+$/g, "").trim();
}

/** 返回这条消息提炼出的记忆（可能为空数组） */
export function extractFromUserMessage(text: string): MemoryDraft[] {
  const out: MemoryDraft[] = [];
  for (const rule of RULES) {
    const m = text.match(rule.re);
    if (m) {
      const content = rule.build(m);
      if (content && content.length >= 4) out.push({ content, source: "auto" });
    }
  }
  return out;
}

/** 从记忆里猜用户的名字（供 system prompt 使用） */
export function guessUserName(memories: string[]): string | undefined {
  for (const m of memories) {
    const hit = m.match(/名字叫「(.{1,10})」/);
    if (hit) return hit[1];
  }
  return undefined;
}

/** 把 LLM 返回的总结文本拆成记忆条目 */
export function parseLLMSummary(text: string): MemoryDraft[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[\s\-*•\d.、]+/, "").trim())
    .filter((l) => l.length >= 4 && l.length <= 60)
    .slice(0, 10)
    .map((content) => ({ content, source: "llm" as const }));
}

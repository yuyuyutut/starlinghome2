/**
 * thought/mark.ts — 双方思考的标记协议（对齐 StarHub 教程）
 * · 人类附言：只把「存在标记」拼进当轮请求，正文永不自动进模型上下文
 * · 机的旁白：模型输出 [[THOUGHT:…]]，界面拆分显示；未闭合的块不得变成公开回复
 */

/** 附言长度上限（教程：超过即拒绝，不偷偷截断） */
export const THOUGHT_MAX = 4000;

/** 存在标记：字数和编号都由代码拼接，绝不交给模型填写 */
export function buildThoughtMarker(thought: string, messageId: string): string {
  return `〔这条消息附有用户思考·${[...thought].length}字·#${messageId}〕`;
}

/** 把存在标记追加到当轮 user 消息内容（字符串或多模态块都支持） */
export function attachThoughtMarker(content: string | unknown[], marker: string): string | unknown[] {
  if (typeof content === "string") return `${content}\n\n${marker}`;
  return [...content, { type: "text", text: marker }];
}

export interface ThoughtSplit {
  /** 内心旁白（空串表示没有） */
  thought: string;
  /** 对人类说的公开回复 */
  reply: string;
}

/**
 * 严格拆分机的完整回复（对齐教程 splitThought）：
 * 标记未闭合时，旁白丢弃、标记前的文字也不进公开回复（未完成的块不能变成公开文字）。
 */
export function splitThought(raw: string): ThoughtSplit {
  const start = "[[THOUGHT:";
  const i = raw.indexOf(start);
  if (i < 0) return { thought: "", reply: raw };
  const end = raw.indexOf("]]", i + start.length);
  if (end < 0) return { thought: "", reply: raw.slice(0, i) };
  return {
    thought: raw.slice(i + start.length, end).trim(),
    reply: (raw.slice(0, i) + raw.slice(end + 2)).trim(),
  };
}

/** 流式过程中供界面显示的安全拆分：未闭合标记只截掉、不把残块画进气泡 */
export function splitThoughtStreaming(raw: string): ThoughtSplit {
  const start = "[[THOUGHT:";
  const i = raw.indexOf(start);
  if (i < 0) return { thought: "", reply: raw };
  const end = raw.indexOf("]]", i + start.length);
  if (end < 0) return { thought: "", reply: raw.slice(0, i) };
  return {
    thought: raw.slice(i + start.length, end).trim(),
    reply: (raw.slice(0, i) + raw.slice(end + 2)).trim(),
  };
}

/** 剥除模型把协议复述出来的回声（保存与展示两处都过一遍；只删精确格式，不误伤人类自己讨论协议的原话） */
export function stripThoughtEcho(text: string): string {
  return text
    .replace(/〔这条消息附有用户思考·[^〕]*〕/g, "")
    .replace(/\[\[THOUGHT:[\s\S]*?\]\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** 校验附言文本：非字符串/超长抛错，空串归一为 null */
export function validateThoughtText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("invalid_thought");
  if ([...value].length > THOUGHT_MAX) throw new Error("invalid_thought");
  return value.trim() || null;
}

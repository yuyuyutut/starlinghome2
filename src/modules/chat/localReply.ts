/**
 * chat/localReply.ts — 没填 API Key 时的本地兜底回复
 * 规则简陋，只是让空 Key 状态下也能体验完整交互流程。
 */
import type { CharacterCard } from "@/modules/character/types";

const OPENERS = ["嗯嗯，我在听～", "嘿嘿，说到这个我就来劲了。", "原来如此，然后呢？", "我懂我懂！", "嗯……让我想想哦。"];

const FOLLOWUPS = [
  "你最近还有什么想做的事吗？",
  "今天有没有发生什么好玩的事？",
  "要不要跟我说说细节？",
  "说起来，你吃饭了吗？",
  "我在呢，继续说呀。",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function localReply(card: CharacterCard, userText: string, memories: string[]): string {
  // 简单回应特定输入
  if (/你好|在吗|hi|hello/i.test(userText)) return `${card.avatar} 在呢在呢！等你好久了～`;
  if (/晚安/.test(userText)) return "晚安，做个好梦。我会在这里等你的 🌙";
  if (/早安|早上好/.test(userText)) return "早安！新的一天也要加油呀 ☀️";
  if (/你是谁/.test(userText)) return `我是${card.name}呀，${card.relationship}。${card.background || ""}`;
  if (/记住/.test(userText)) return "嗯！我已经牢牢记住了，不会忘的。";

  // 有机会就带上一条记忆，显得更"记得你"
  let memPart = "";
  const usable = memories.filter((m) => !m.startsWith("TA 的名字"));
  if (usable.length > 0 && Math.random() > 0.5) {
    // 只取第一条记忆的主干，去掉"记住哦"之类的语气尾巴，避免引用时句子别扭
    const raw = usable[0].replace(/^TA /, "你").split(/，(记住|记得|别忘)/)[0];
    memPart = `对了，我还记得${raw}呢。`;
  }

  return `${pick(OPENERS)}${memPart}${pick(FOLLOWUPS)}`;
}

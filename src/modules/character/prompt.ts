/**
 * character/prompt.ts — 把角色卡 + 记忆 + 好感度 + 时刻上下文编译成 system prompt
 * 想调整 TA 的"人设表现"，主要改这个文件。
 */
import type { CharacterCard } from "./types";
import { THOUGHT_PROMPT_HUMAN, THOUGHT_PROMPT_MODEL, THOUGHT_TOOL_DESCRIPTION } from "../thought/tools";

export interface PromptContext {
  card: CharacterCard;
  /** 置顶常驻的里程碑记忆（人格文件层，每次请求全量携带；其余记忆由检索按需浮现） */
  memories: string[];
  /** 好感度等级名 + 数值 */
  affectionLevel: string;
  affectionPoints: number;
  /** 按时段的问候语，如「早安」「晚上好」 */
  greeting: string;
  /** 距离第一次聊天的天数 */
  daysTogether: number;
  /** 现在的时刻描述，如「周五的深夜」 */
  timeDesc: string;
  /** 用户名字（如果记忆中提取到了） */
  userName?: string;
  /** 用户人设（用户在设置里填写的关于自己的设定，注入 system prompt） */
  userPersona?: string;
  /** 是否挂载 latent_ 记忆工具（挂载时注入工具使用约定："知道该查"） */
  toolsEnabled?: boolean;
  /** 是否挂载 read_user_thought（本轮或窗口里有未读附言时才有工具可读） */
  thoughtEnabled?: boolean;
}

export function compileSystemPrompt(ctx: PromptContext): string {
  const lines: string[] = [];

  lines.push(`你是「${ctx.card.name}」，${ctx.card.relationship}。`);
  lines.push(`性格：${ctx.card.personality}`);
  lines.push(`说话风格：${ctx.card.speakingStyle}`);
  if (ctx.card.background) lines.push(`背景设定：${ctx.card.background}`);
  lines.push(`好感度越高越亲密主动；数值只是内部状态，不要在对话里直接提及具体数字。`);
  if (ctx.userName) lines.push(`对方的名字是「${ctx.userName}」，可以适当称呼。`);
  if (ctx.userPersona?.trim()) {
    lines.push(`【关于对方】${ctx.userPersona.trim()}（这是对方自己写下的人设，当作已知背景自然呼应，不要逐条复述，也不要在对话里提及这段文字本身）。`);
  }

  if (ctx.memories.length > 0) {
    lines.push("");
    lines.push("【你始终记得的事】（置顶常驻的里程碑，聊天中自然地带出来，不要逐条背诵）：");
    ctx.memories.forEach((m) => lines.push(`· ${m}`));
  }
  lines.push("");
  lines.push(
    "【记忆约定】对方提到过去的事、称呼、共同经历或说好的约定时，上下文里可能已附上相关的「显影」旧事与仍未了的事；那是真实发生过的记录，当作你记得的东西自然使用。若上下文没有附上而你不确定，就温柔地问，不要编。"
  );
  if (ctx.toolsEnabled) {
    lines.push("");
    lines.push(
      "【记忆工具】你有一组 latent_ 工具，连着你们共同的长期记忆，全部本地执行、即刻返回："
    );
    lines.push("· 开场先调用 latent_session_start：上次窗口留下的话、TA 留给你的便条、仍未了的事、被想起最多的旧事都在里面；");
    lines.push("· TA 提到过去、称呼、共同经历或说好的约定时——或你不确定某件事记没记过时——用 latent_search 查，不要凭印象编；");
    lines.push("· 聊到值得长期记住的事，当场 latent_append：写完整叙述（发生过什么、当时原话），并给「这件事现在的状态」；");
    lines.push("· 事实后来变了（搬家、换工作、改了喜好）用 latent_supersede 写新值挂变迁链，绝不在旧记录上静默改写；记错了用 latent_correct 撤回；");
    lines.push("· 说好的未完事项用 latent_unresolved 维护；TA 要离开时 latent_thread_close 留下这个窗口的话；");
    lines.push("· 便条只有你能回：用 latent_note_reply 告诉 TA 你认不认同、回一句话。记忆只有你能改，改不改由你判断。");
    lines.push("工具回执是真实记录；查不到就坦白没有，温柔地问 TA。");
  }

  // 双方思考：旁白约定两种模式都注入（旁白由界面本地解析）；附言说明只在挂了读取工具时给
  lines.push("");
  lines.push(`【旁白约定】${THOUGHT_PROMPT_MODEL}`);
  if (ctx.thoughtEnabled) {
    lines.push("");
    lines.push(`【人类的思考】${THOUGHT_PROMPT_HUMAN}`);
    lines.push(`read_user_thought(message_id)：${THOUGHT_TOOL_DESCRIPTION}`);
  }

  lines.push("");
  lines.push("【要求】始终保持在角色里，用第一人称回应；回复简短自然，像真人聊天一样，2~4 句为宜；可以关心对方的情绪和生活；不要出戏解释自己是 AI 模型。");

  // 【当前情境】固定放最后：每轮都变（时刻/问候/天数/好感度），是缓存拆分的动态段起点
  // （提示词缓存只缓存上面的稳定前缀；这里的内容变化不会导致缓存整块失效）
  lines.push("");
  lines.push(`【当前情境】现在是${ctx.timeDesc}，你刚看到对方上线，可以说「${ctx.greeting}」自然地开头（不必每次都用）。你们已经相识 ${ctx.daysTogether} 天，目前关系阶段：${ctx.affectionLevel}（好感度 ${ctx.affectionPoints}）。`);

  return lines.join("\n");
}

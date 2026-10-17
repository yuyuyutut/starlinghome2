/**
 * latent/toolLoop.ts — 客户端工具回路（对齐原版"知道该查 vs 查得到"的完整闭环）
 * 模型发起 latent_ 工具调用 → 前端在本地记忆库上立刻执行 → 回执作为 tool 消息追加 →
 * 再次请求，直到模型给出最终回复。最多 5 轮，防止死循环。
 */
import { streamChat, type ChatMessage, type ChatResult, type ToolSpec } from "@/lib/llm";
import { stripCacheControls } from "../cache/split";

export interface ToolLoopOpts {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  stream: boolean;
  temperature: number;
  extraBody?: Record<string, unknown>;
  /** 提示词缓存：额外请求头（稳定 session id 等），透传给每次 streamChat */
  headers?: Record<string, string>;
  /** 提示词缓存：拿到 provider usage 时回调（观测日志用） */
  onUsage?: (usage: Record<string, unknown>) => void;
  /** 提示词缓存：首轮是否带了 cache_control（工具回执轮会剥掉，见 Cove 笔记 §6） */
  firstTurnCached?: boolean;
  onToken: (delta: string, full: string) => void;
  onThinking?: (delta: string, full: string) => void;
  /** 每个工具执行完回调（用于界面轻提示） */
  onToolExecuted?: (name: string) => void;
  /** 本地执行器：返回给模型的回执文本 */
  execute: (name: string, args: Record<string, unknown>) => Promise<string>;
}

const MAX_ITERATIONS = 5;

export interface ToolLoopResult {
  text: string;
  thinking: string;
  usedTools: string[];
}

export async function runToolLoop(opts: ToolLoopOpts): Promise<ToolLoopResult> {
  const history: ChatMessage[] = [...opts.messages];
  const usedTools: string[] = [];
  let finalText = "";
  let finalThinking = "";

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // 提示词缓存：工具回执轮（i>0，历史里已有 role:"tool"）形态特殊，剥掉 cache_control 再发
    const followUp = i > 0 && opts.firstTurnCached === true;
    const payload = followUp ? stripCacheControls(history, opts.tools) : { messages: history, tools: opts.tools };
    const res: ChatResult = await streamChat({
      baseUrl: opts.baseUrl,
      apiKey: opts.apiKey,
      model: opts.model,
      messages: payload.messages,
      tools: payload.tools,
      signal: opts.signal,
      stream: opts.stream,
      temperature: opts.temperature,
      extraBody: opts.extraBody,
      headers: opts.headers,
      onUsage: opts.onUsage,
      onToken: i === MAX_ITERATIONS - 1 ? opts.onToken : () => {},
      onThinking: opts.onThinking,
    });

    if (res.toolCalls.length === 0) {
      finalText = res.text;
      finalThinking = res.thinking;
      break;
    }

    // 模型发起了工具调用：把这一轮（含 tool_calls）记进历史，本地执行后追加回执
    history.push({
      role: "assistant",
      content: res.text || "",
      ...(res.thinking ? { reasoning_content: res.thinking } : {}),
      tool_calls: res.toolCalls,
    } as ChatMessage);
    for (const call of res.toolCalls) {
      usedTools.push(call.function.name);
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      const receiptText = await opts.execute(call.function.name, args);
      opts.onToolExecuted?.(call.function.name);
      history.push({ role: "tool", tool_call_id: call.id, name: call.function.name, content: receiptText });
    }
  }

  if (usedTools.length > 0 && finalText === "") {
    // 循环上限耗尽仍只有工具调用：礼貌收尾
    finalText = "（想了想你们的事，接着说）";
  }
  return { text: finalText, thinking: finalThinking, usedTools };
}

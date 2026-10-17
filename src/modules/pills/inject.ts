/**
 * pills/inject.ts — 药丸注入（阅后即焚）
 * 把挂着的药拼成 [药丸 · 药名] 块，排在本轮用户消息最前面、紧贴用户原话；
 * 只进入这一次请求的 messages，不写入聊天记录，下一轮模型读不到。
 */
import { pillBlock, pillByCode, type Pill } from "./pills";

/** 多颗药按挂载顺序拼接（\n\n 分隔），无有效药时返回空串 */
export function buildPillPrefix(codes: string[]): string {
  return codes
    .map((c) => pillByCode(c))
    .filter((p): p is Pill => !!p)
    .map(pillBlock)
    .join("\n\n");
}

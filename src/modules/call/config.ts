/**
 * call/config.ts — 语音通话常量（StarHub 实时语音通话教程 SPEC v1 的前端落地）
 * 音频契约：单声道 16 位有符号小端 PCM；原始 PCM 采样率按 OpenAI 兼容 /audio/speech
 * 的 pcm 输出约定取 24 kHz（服务商返回可解码容器时自动改用其实际采样率）。
 */

/** 原始 PCM（s16le）采样率：OpenAI 系 /audio/speech response_format=pcm 的输出 */
export const PCM_SAMPLE_RATE = 24000;

/** 启动缓冲：约 0.5 秒音频（字节 = sr × 2B × 0.5s） */
export const START_BUFFER_SEC = 0.5;

/** 排程提前量：每块安排到上一块结束点，且不早于 currentTime + 50ms（教程 §7） */
export const SCHEDULE_AHEAD_SEC = 0.05;

/** 背压：后端/合成最多领先已播完两句（教程 §2） */
export const MAX_SENTENCES_AHEAD = 2;

/** 单句 PCM 上限：60 秒（教程 §6，前后端一致） */
export const MAX_SENTENCE_BYTES = PCM_SAMPLE_RATE * 2 * 60;

/** 句子上限（内存保护，超出视为异常回合） */
export const MAX_UNITS_PER_TURN = 50;

/** 通话语言（识别 lang 标签 / 合成与输出口径） */
export const CALL_LANGS = {
  zh: { id: "zh", srTag: "zh-CN", label: "中文" },
  en: { id: "en", srTag: "en-US", label: "English" },
} as const;

export type CallLang = keyof typeof CALL_LANGS;

/** 双语协议行标记（教程 §8：EN = 英文台词，ZH = 中文释义/台词） */
export const BILINGUAL_LABELS = { en: "EN", zh: "ZH" } as const;

/** 语言快照：一轮开始时固定，通话中切换只影响下一轮（教程 §3） */
export interface LangSnapshot {
  /** 输入（识别）语言 */
  input: CallLang;
  /** 输出（生成 + 合成）语言 */
  output: CallLang;
}

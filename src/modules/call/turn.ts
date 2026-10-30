/**
 * call/turn.ts — 一轮通话的编排（StarHub 教程 §4/§5/§6 的前端落地）
 * 流水线：ASR 文本 → 流式生成 → 稳定句解析（只追加、不重写）
 *        → 背压等待（最多领先已播完两句）→ 逐句 TTS → 音频时间轴播放
 * 取消：AbortSignal 贯穿生成、合成与背压等待；迟到事件按 turnId/信号丢弃。
 */

import { streamChat, type ChatMessage } from "@/lib/llm";
import type { Settings } from "@/lib/db";
import type { CharacterCard } from "@/modules/character/types";
import { compileSystemPrompt } from "@/modules/character/prompt";
import { pinnedLines, guessUserNameFromRecords } from "@/modules/latent/extract";
import type { MemoryRecord } from "@/modules/latent/types";
import { buildPassiveBlock } from "@/modules/latent/passive";
import { surfaceFacts } from "@/modules/latent/facts";
import type { EmbedConfig } from "@/modules/latent/embed";
import { greetingByHour, timeDesc, daysTogether, levelOf } from "@/modules/affection/affection";
import { advanceBodyForChar } from "@/modules/body/store";
import { MAX_SENTENCES_AHEAD, MAX_UNITS_PER_TURN, BILINGUAL_LABELS, type LangSnapshot } from "./config";
import { SpeechParser, type SpeechUnit } from "./parser";
import { synthesizeSentence, pcmSeconds, type VoiceConfig } from "./tts";
import type { PcmPlayer } from "./player";

export interface TurnMessage {
  role: "user" | "assistant";
  content: string;
  ts?: number;
}

export interface TurnDeps {
  charId: string;
  card: CharacterCard;
  messages: TurnMessage[];
  records: MemoryRecord[];
  affection: number;
  firstVisit: number;
  settings: Settings;
}

export interface TurnEvents {
  /** 第 k 句稳定发布（字幕区此时可显示） */
  onSentence: (k: number, unit: SpeechUnit) => void;
  /** 时间轴测量点（教程：记录能解释体验的时间点） */
  onTiming: (label: string, ts: number) => void;
}

export interface TurnResult {
  ok: boolean;
  canceled?: boolean;
  /** 本轮实际发布的稳定文本（用于写入聊天记录） */
  text?: string;
  sentences?: number;
  error?: string;
}

const MAX_CONTEXT = 24;

function bilingualInstruction(snap: LangSnapshot): string {
  const spoken = BILINGUAL_LABELS[snap.output];
  const gloss = BILINGUAL_LABELS[snap.output === "en" ? "zh" : "en"];
  const spokenName = snap.output === "en" ? "英文" : "中文";
  const glossName = snap.output === "en" ? "中文" : "英文";
  return (
    `【通话双语模式】这是一次语音通话，对方用${snap.input === "zh" ? "中文" : "英文"}说话。` +
    `请把回答严格按行成对输出：\n` +
    `${spoken}: <要朗读的${spokenName}台词一行>\n${gloss}: <对应的${glossName}一行>\n` +
    `每组先${spokenName}后${glossName}；每次一至两句。除这两种行外不要输出任何内容；${glossName}行不会被朗读。`
  );
}

function voiceCfgOf(s: Settings): VoiceConfig {
  return {
    baseUrl: s.voiceBaseUrl.trim() || s.baseUrl.trim(),
    apiKey: s.voiceApiKey.trim() || s.apiKey.trim(),
    model: s.voiceModel.trim() || "tts-1",
    voice: s.voiceName.trim() || "alloy",
  };
}

/** 组装通话用的 system prompt（角色卡 + 情境 + 显影/事实 + 生理状态卡） */
async function buildCallSystem(deps: TurnDeps, userText: string, snap: LangSnapshot): Promise<string> {
  const { settings } = deps;
  const sys = compileSystemPrompt({
    card: deps.card,
    memories: pinnedLines(deps.records),
    affectionLevel: levelOf(deps.affection).name,
    affectionPoints: deps.affection,
    greeting: greetingByHour(),
    daysTogether: daysTogether(deps.firstVisit),
    timeDesc: timeDesc(),
    userName: guessUserNameFromRecords(deps.records),
    userPersona: settings.userPersona,
    toolsEnabled: false,
    thoughtEnabled: false,
  });
  const blocks: string[] = [snap.input !== snap.output ? `${sys}\n\n${bilingualInstruction(snap)}` : sys];

  // 显影注入（与聊天同口径：工具模式在通话中关闭，走宿主注入）
  if (settings.passiveRecall) {
    const embedCfg: EmbedConfig | null =
      settings.embeddings && (settings.embedApiKey.trim() || settings.apiKey)
        ? {
            baseUrl: settings.embedBaseUrl.trim() || settings.baseUrl,
            apiKey: settings.embedApiKey.trim() || settings.apiKey,
            model: settings.embedModel.trim() || "bge-m3",
          }
        : null;
    if (settings.factMode) {
      const sf = await surfaceFacts(deps.charId, userText, embedCfg);
      if (sf) blocks.push(sf.block);
    } else {
      const passive = await buildPassiveBlock(deps.records, userText, embedCfg);
      if (passive) blocks.push(passive.block);
    }
  }

  // 生理状态卡（Eventide）：与聊天共用推进流程
  if (settings.bodyCycle) {
    const lastUserTs =
      [...deps.messages].reverse().find((m) => m.role === "user")?.ts ?? null;
    const card = advanceBodyForChar(deps.charId, {
      text: userText,
      triggerWords: settings.bodyTriggers,
      lastCounterpartMessageAt: lastUserTs,
      inject: settings.bodyInject,
    });
    if (card) blocks.push(card);
  }

  return blocks.join("\n\n");
}

/** 运行一轮：返回保存级文本；events/onSentence 用于字幕与测量 */
export async function runAssistantTurn(
  deps: TurnDeps,
  userText: string,
  snap: LangSnapshot,
  player: PcmPlayer,
  events: TurnEvents,
  signal: AbortSignal
): Promise<TurnResult> {
  const parser = new SpeechParser(snap.input !== snap.output, BILINGUAL_LABELS[snap.output]);
  const voiceCfg = voiceCfgOf(deps.settings);
  let sentenceCount = 0;

  /* 消费侧：按序背压 + 逐句合成（与生成侧并行，低延迟来自工序重叠） */
  const queue: SpeechUnit[] = [];
  const box: { generationDone: boolean; consumerError: Error | null; pendingResolve: ((u: SpeechUnit | null) => void) | null } = {
    generationDone: false,
    consumerError: null,
    pendingResolve: null,
  };
  const MAX_BYTES_PER_SENTENCE = 60 * 24000 * 2; // 与教程一致：单句 60 秒上限（按最高采样率计）

  const takeUnit = () =>
    new Promise<SpeechUnit | null>((resolve) => {
      if (queue.length > 0) return resolve(queue.shift()!);
      if (box.generationDone) return resolve(null);
      box.pendingResolve = resolve;
    });

  const releaseUnit = () => {
    const r = box.pendingResolve;
    if (!r) return;
    box.pendingResolve = null;
    r(queue.length > 0 ? queue.shift()! : null);
  };

  const consumer = (async () => {
    for (;;) {
      const unit = await takeUnit();
      if (!unit) return;
      sentenceCount += 1;
      if (sentenceCount > MAX_UNITS_PER_TURN) throw new Error("本轮句子过多");
      const k = sentenceCount;
      // 背压：最多领先已播完两句（教程 §2/§6）
      const ok = await player.waitAck(k - MAX_SENTENCES_AHEAD, signal, 90_000);
      if (!ok || signal.aborted) return;
      events.onSentence(k, unit);
      if (!unit.speech) continue;
      const pcm = await synthesizeSentence(voiceCfg, unit.speech, signal);
      if (signal.aborted) return;
      if (pcmSeconds(pcm.pcm.byteLength, pcm.sampleRate) > 62) throw new Error("sentence too long");
      if (pcm.pcm.byteLength > MAX_BYTES_PER_SENTENCE) throw new Error("sentence too long");
      player.feed(k, pcm.pcm, pcm.sampleRate, true);
      events.onTiming("first_audio_chunk", performance.now());
    }
  })().catch((e) => {
    box.consumerError = e instanceof Error ? e : new Error(String(e));
    releaseUnit(); // 唤醒等待中的 consumer 走失败终态
  });

  /* 生产侧：流式生成 → 稳定句解析 → 入队（只追加，不重写） */
  try {
    const system = await buildCallSystem(deps, userText, snap);
    if (signal.aborted) return { ok: false, canceled: true };
    const history: ChatMessage[] = [
      { role: "system", content: system },
      ...deps.messages
        .filter((m) => m.content)
        .slice(-MAX_CONTEXT)
        .map((m) => ({ role: m.role, content: m.content }) as ChatMessage),
      { role: "user", content: userText },
    ];
    await streamChat({
      baseUrl: deps.settings.baseUrl,
      apiKey: deps.settings.apiKey,
      model: deps.settings.model,
      messages: history,
      signal,
      stream: true,
      temperature: deps.settings.temperature,
      onToken: (_d, full) => {
        if (signal.aborted) return;
        try {
          const units = parser.feed(full);
          if (units.length > 0) {
            events.onTiming("first_stable_text", performance.now());
            queue.push(...units);
            releaseUnit();
          }
        } catch (e) {
          // 解析失败不能静默：让 consumer 走失败终态
          queue.length = 0;
          box.generationDone = true;
          box.consumerError = e instanceof Error ? e : new Error(String(e));
          releaseUnit();
        }
      },
    });
    if (!signal.aborted) {
      const rest = parser.finish();
      if (rest.length > 0) {
        events.onTiming("first_stable_text", performance.now());
        queue.push(...rest);
      }
    }
  } catch (e) {
    box.generationDone = true;
    releaseUnit();
    await consumer.catch(() => {});
    if (signal.aborted) {
      return { ok: false, canceled: true, text: parser.text, sentences: sentenceCount };
    }
    return { ok: false, error: `生成失败：${e instanceof Error ? e.message : e}`, text: parser.text, sentences: sentenceCount };
  }

  box.generationDone = true;
  releaseUnit();
  await consumer;

  if (box.consumerError) {
    return signal.aborted
      ? { ok: false, canceled: true, text: parser.text, sentences: sentenceCount }
      : { ok: false, error: box.consumerError.message, text: parser.text, sentences: sentenceCount };
  }
  if (signal.aborted) return { ok: false, canceled: true, text: parser.text, sentences: sentenceCount };

  // 等待末句真正播完（audio_end ≠ 播放完成；显式等待 ack）
  if (sentenceCount > 0) {
    await player.waitAck(sentenceCount, signal, 120_000);
  }
  events.onTiming("turn_playback_end", performance.now());
  return { ok: true, text: parser.text, sentences: sentenceCount };
}

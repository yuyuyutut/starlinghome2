/**
 * call/tts.ts — OpenAI 兼容 /audio/speech 合成适配器
 * 逐句请求（低延迟来自工序重叠：第 k 句播放时，第 k+1 句已在合成，教程 §1/§6）。
 * 返回 PCM（s16le）与真实采样率：优先按原始 PCM 解码；
 * 服务商若忽略 response_format=pcm 返回 mp3/opus/wav 等可解码容器，自动解码为 PCM 并沿用其实际采样率。
 */

import { PCM_SAMPLE_RATE } from "./config";

export interface VoiceConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  voice: string;
}

export interface PcmResult {
  pcm: ArrayBuffer;
  /** 实际采样率（原始 PCM 取 PCM_SAMPLE_RATE；容器解码取容器自身采样率） */
  sampleRate: number;
}

/** 原始 PCM 时长（秒），用于单句 60 秒上限校验 */
export function pcmSeconds(bytes: number, sampleRate: number): number {
  return bytes / 2 / sampleRate;
}

export async function synthesizeSentence(
  cfg: VoiceConfig,
  text: string,
  signal: AbortSignal
): Promise<PcmResult> {
  const base = cfg.baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      model: cfg.model,
      input: text,
      voice: cfg.voice,
      response_format: "pcm",
    }),
    signal,
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 160);
    throw new Error(`语音合成失败 ${res.status}${detail ? `：${detail}` : ""}`);
  }
  const raw = await res.arrayBuffer();
  if (raw.byteLength === 0) throw new Error("语音合成为空");
  return normalizeToPcm(raw);
}

/** 把响应字节规整为 s16le PCM：先尝试容器解码，失败则按原始 PCM 处理 */
async function normalizeToPcm(raw: ArrayBuffer): Promise<PcmResult> {
  try {
    const ctx = new AudioContext();
    try {
      const decoded = await ctx.decodeAudioData(raw.slice(0));
      void ctx.close();
      const ch = decoded.getChannelData(0);
      const out = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) {
        const v = Math.max(-1, Math.min(1, ch[i]));
        out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      return { pcm: out.buffer, sampleRate: decoded.sampleRate };
    } catch {
      void ctx.close();
    }
  } catch {
    /* AudioContext 不可用时按原始 PCM 处理 */
  }
  return { pcm: raw, sampleRate: PCM_SAMPLE_RATE };
}

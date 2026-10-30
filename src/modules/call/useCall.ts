/**
 * call/useCall.ts — 通话会话状态机（轮流说话：聆听 → 生成/播放 → 再聆听，直到挂断）
 * 教程边界：不实现插话打断；思考与播放期间输入入口关闭（不监听，避免外放自答）。
 * 语言快照：一轮开始时固定，通话中切换只影响下一轮（教程 §3）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Companion } from "@/hooks/useCompanion";
import { CALL_LANGS, type CallLang, type LangSnapshot } from "./config";
import { createRecognition, asrSupported, type AsrHandle } from "./asr";
import { PcmPlayer } from "./player";
import { runAssistantTurn } from "./turn";
import type { SpeechUnit } from "./parser";

export type CallPhase = "idle" | "listening" | "thinking" | "speaking" | "ended";

export interface CallCaption {
  k: number;
  unit: SpeechUnit;
}

export interface CallState {
  active: boolean;
  phase: CallPhase;
  /** 用户正在说的临时识别文本 */
  interim: string;
  /** 本轮已稳定发布的句子（字幕） */
  captions: CallCaption[];
  langs: LangSnapshot;
  startedAt: number;
  notice: string | null;
  /** 没有最终文本的停口次数（识别自然结束但没听清内容） */
  emptyHears: number;
}

const IDLE: CallState = {
  active: false,
  phase: "idle",
  interim: "",
  captions: [],
  langs: { input: "zh", output: "zh" },
  startedAt: 0,
  notice: null,
  emptyHears: 0,
};

/* ---------- 模块级入口：聊天页按钮经此启动通话 ---------- */
interface CallController {
  start: () => void;
}
let controller: CallController | null = null;
export function requestCallStart() {
  controller?.start();
}

export function useCall(c: Companion) {
  const [state, setState] = useState<CallState>(IDLE);
  const playerRef = useRef<PcmPlayer | null>(null);
  const asrRef = useRef<AsrHandle | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false); // 思考/播放期间禁止第二轮输入（教程 §9）
  const langsRef = useRef<LangSnapshot>(IDLE.langs);
  const stateRef = useRef(state);
  stateRef.current = state;

  const stopListening = useCallback(() => {
    asrRef.current?.abort();
    asrRef.current = null;
  }, []);

  const hangUp = useCallback(
    (notice?: string) => {
      abortRef.current?.abort();
      abortRef.current = null;
      stopListening();
      playerRef.current?.cancel();
      busyRef.current = false;
      setState((s) => ({ ...IDLE, langs: s.langs, notice: notice ?? null, active: false, phase: "idle" }));
    },
    [stopListening]
  );

  const handleUserTextRef = useRef<(text: string) => void>(() => {});
  const startListeningRef = useRef<() => void>(() => {});

  const startListening = useCallback(() => {
    if (stateRef.current.phase === "idle") return;
    const snap = langsRef.current;
    const rec = createRecognition(CALL_LANGS[snap.input].srTag, {
      onInterim: (text) => setState((s) => ({ ...s, interim: text })),
      onFinal: (text) => {
        setState((s) => ({ ...s, interim: "" }));
        handleUserTextRef.current(text);
      },
      onEnd: () => {
        // 识别自然结束但没拿到最终文本：继续听（对方还没说话）
        setState((s) => {
          if (s.phase !== "listening") return s;
          const empty = s.interim.trim() ? 0 : s.emptyHears + 1;
          return { ...s, interim: "", emptyHears: empty };
        });
        // 短暂间隔后重新开麦（Chrome 识别器停口即结束）
        window.setTimeout(() => {
          if (stateRef.current.phase === "listening" && !asrRef.current?.active) {
            asrRef.current?.start();
          }
        }, 400);
      },
      onError: (message) => {
        setState((s) => ({ ...s, notice: message }));
      },
    });
    asrRef.current = rec;
    if (!rec) {
      setState((s) => ({
        ...s,
        notice: asrSupported() ? "识别启动失败" : "这个浏览器不支持语音识别（请用 Chrome / Edge）",
      }));
      return;
    }
    rec.start();
  }, []);
  startListeningRef.current = startListening;

  const handleUserText = useCallback(
    async (text: string) => {
      if (busyRef.current) return; // 播放/思考期间不允许第二轮（教程 §9）
      const trimmed = text.trim();
      if (!trimmed) return;
      stopListening();
      busyRef.current = true;
      const snap: LangSnapshot = { ...langsRef.current }; // 本轮语言快照
      const ac = new AbortController();
      abortRef.current = ac;
      setState((s) => ({ ...s, phase: "thinking", captions: [], interim: "" }));
      const t0 = performance.now();
      console.info("[call] turn start", { snap, t0 });

      if (!playerRef.current) playerRef.current = new PcmPlayer({});
      const player = playerRef.current;
      player.ensureContext(); // 已在点击动作链内（startCall 的用户手势可延续）
      player.resetForNextTurn();
      player.cb = {
        onTimelineStart: () => {
          console.info("[call] timeline start", performance.now() - t0);
          setState((s) => (s.phase === "thinking" || s.phase === "speaking" ? { ...s, phase: "speaking" } : s));
        },
      };

      const result = await runAssistantTurn(
        {
          charId: c.charId,
          card: c.card,
          messages: c.messages.map((m) => ({ role: m.role, content: m.content, ts: m.ts })),
          records: c.latent.records,
          affection: c.affection,
          firstVisit: c.firstVisit,
          settings: c.settings,
        },
        trimmed,
        snap,
        player,
        {
          onSentence: (k, unit) => {
            setState((s) => ({ ...s, captions: [...s.captions, { k, unit }] }));
          },
          onTiming: (label, ts) => console.info(`[call] ${label}`, ts - t0),
        },
        ac.signal
      );

      if (ac.signal.aborted) return; // 已挂断，迟到的结果全部丢弃

      if (result.ok && result.text?.trim()) {
        // 持久化实际发布的稳定内容（教程：允许保存的通话记录稳定正文）
        await c.appendCallExchange(trimmed, result.text.trim());
      } else if (!result.ok) {
        setState((s) => ({ ...s, notice: result.error ?? "这一轮没说完，再试一次？" }));
      }

      busyRef.current = false;
      abortRef.current = null;
      // 回到聆听，进入下一轮
      setState((s) => ({ ...s, phase: "listening", captions: [] }));
      startListeningRef.current();
    },
    [c, stopListening]
  );
  handleUserTextRef.current = handleUserText;

  const start = useCallback(() => {
    if (stateRef.current.active) return;
    // 语音服务配置检查（OpenAI 兼容 /audio/speech）
    const s = c.settings;
    if (!(s.voiceApiKey.trim() || s.apiKey.trim())) {
      c.toast("先在「设置 · 语音通话」里配置语音服务，或沿用聊天的 Key", "info");
      return;
    }
    if (!asrSupported()) {
      c.toast("这个浏览器不支持语音识别，通话请用 Chrome / Edge", "info");
    }
    const startedAt = Date.now();
    setState((prev) => ({
      ...IDLE,
      active: true,
      phase: "listening",
      langs: prev.langs,
      startedAt,
    }));
    // setState 异步，startListening 的 phase 守卫依赖 stateRef：先同步落一份
    stateRef.current = {
      ...IDLE,
      active: true,
      phase: "listening",
      langs: stateRef.current.langs,
      startedAt,
    };
    // AudioContext 必须在点击手势里创建
    if (!playerRef.current) playerRef.current = new PcmPlayer({});
    playerRef.current.ensureContext();
    startListening();
  }, [c, startListening]);

  /* 供模块级入口调用 */
  useEffect(() => {
    controller = { start };
    return () => {
      controller = null;
    };
  }, [start]);

  /* 卸载兜底：释放识别与播放 */
  useEffect(
    () => () => {
      asrRef.current?.abort();
      playerRef.current?.cancel();
      abortRef.current?.abort();
    },
    []
  );

  const setLang = useCallback((which: "input" | "output", lang: CallLang) => {
    langsRef.current = { ...langsRef.current, [which]: lang };
    setState((s) => ({ ...s, langs: { ...s.langs, [which]: lang } }));
  }, []);

  return { state, start, hangUp, setLang };
}

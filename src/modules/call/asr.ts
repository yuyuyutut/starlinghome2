/**
 * call/asr.ts — 浏览器 Web Speech API 识别适配器（教程 §3：输入语言交给识别）
 * 只负责识别；更换识别实现不需要改动后面的文字与音频流水线。
 * 兼容性：Chrome/Edge 完整支持；Safari/Firefox 可能不存在，调用方需降级提示。
 */

export interface AsrCallbacks {
  /** 识别中的临时文本（UI 展示「正在听…」） */
  onInterim?: (text: string) => void;
  /** 一段最终识别结果 */
  onFinal: (text: string) => void;
  /** 识别器自然结束（通常是对方停口；也可能由网络/权限触发） */
  onEnd: () => void;
  onError?: (message: string) => void;
}

export interface AsrHandle {
  start: () => void;
  /** 立即结束并丢弃未 finalized 的内容 */
  abort: () => void;
  readonly active: boolean;
}

type RecognitionCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getCtor(): RecognitionCtor | null {
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition || w.webkitSpeechRecognition) as RecognitionCtor | null;
}

export function asrSupported(): boolean {
  return getCtor() !== null;
}

/** 创建一次识别会话（轮流说话：continuous=false，停口即 onEnd） */
export function createRecognition(langTag: string, cb: AsrCallbacks): AsrHandle | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  let stopped = false;
  let active = false;

  rec.lang = langTag;
  rec.continuous = false;
  rec.interimResults = true;

  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) {
        const t = r[0].transcript.trim();
        if (t) cb.onFinal(t);
      } else {
        interim += r[0].transcript;
      }
    }
    if (interim.trim()) cb.onInterim?.(interim.trim());
  };
  rec.onend = () => {
    active = false;
    if (!stopped) cb.onEnd();
  };
  rec.onerror = (e) => {
    active = false;
    if (stopped) return;
    if (e.error === "aborted" || e.error === "interrupted") return;
    cb.onError?.(e.error === "not-allowed" ? "麦克风权限被拒绝" : `识别出错：${e.error}`);
  };

  return {
    start: () => {
      if (active) return;
      stopped = false;
      active = true;
      try {
        rec.start();
      } catch {
        active = false;
        cb.onError?.("识别启动失败");
      }
    },
    abort: () => {
      stopped = true;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      active = false;
    },
    get active() {
      return active;
    },
  };
}

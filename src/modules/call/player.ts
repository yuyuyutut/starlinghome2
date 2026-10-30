/**
 * call/player.ts — 浏览器按音频时间轴播放（StarHub 教程 §7 的 TS 落地）
 * · 每个 PCM 块转 Float32，安排到同一音频时钟：at = max(next, currentTime + 0.05)
 * · 启动缓冲：先积累 ≥0.5s 音频；该句已收完（短句）允许立即启动
 * · 完成确认：收到 end、全部块排程且 pending==0 才 ack（音频结束事件 ≠ 播放完成）
 * · 取消：先置 canceled 再停节点，防止 stop 触发 onended 误确认
 */

import { SCHEDULE_AHEAD_SEC, START_BUFFER_SEC } from "./config";

export interface PlayerCallbacks {
  /** 本句真的从扬声器播完（单调前进：k 从小到大，绝不回退） */
  onSentencePlayed?: (k: number) => void;
  /** 音频时间轴第一次开始推进（首声时刻，用于测量） */
  onTimelineStart?: () => void;
  /** 全部句子播完且无未决音频 */
  onIdle?: () => void;
}

interface SentenceSlot {
  k: number;
  sampleRate: number;
  bytes: Uint8Array[];
  received: number;
  ended: boolean;
  scheduledBytes: number;
  /** 已排程但尚未播完的音频块数 */
  playing: number;
}

export class PcmPlayer {
  private ctx: AudioContext | null = null;
  private nextTime = 0;
  private nodes = new Set<AudioBufferSourceNode>();
  private canceled = false;
  private started = false;

  /** 句子流水线：允许后一句（k+1）在前一句播放中进入（背压 ≤2 句，教程 §2/§7） */
  private slots: SentenceSlot[] = [];
  private acked = 0;
  private waiters: { min: number; resolve: (ok: boolean) => void }[] = [];
  public cb: PlayerCallbacks;

  constructor(cb: PlayerCallbacks = {}) {
    this.cb = cb;
  }

  /** 必须在明确的点击动作里调用（浏览器自动播放策略） */
  ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.nextTime = 0;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  /** 已确认播完的句子数（背压信用） */
  get ackedCount(): number {
    return this.acked;
  }

  /**
   * 喂入第 k 句的一段 PCM（s16le，偶数字节；网络边界可能落在采样中间，奇数尾部显式失败）。
   * isLast=true 表示该句传输结束（短句豁免启动缓冲）。
   */
  feed(k: number, pcm: ArrayBuffer, sampleRate: number, isLast: boolean): void {
    if (this.canceled) throw new Error("player canceled");
    if (!this.ctx) throw new Error("player not started");
    if (pcm.byteLength % 2 !== 0) throw new Error("unaligned PCM");
    const last = this.slots[this.slots.length - 1];
    let slot: SentenceSlot;
    if (last && last.k === k) {
      slot = last;
    } else if (!last || k === last.k + 1) {
      slot = { k, sampleRate, bytes: [], received: 0, ended: false, scheduledBytes: 0, playing: 0 };
      this.slots.push(slot);
    } else {
      throw new Error(`sentence out of order: got ${k}, expected ${last.k + 1}`);
    }
    const bytes = new Uint8Array(pcm);
    slot.bytes.push(bytes);
    slot.received += bytes.byteLength;
    if (isLast) slot.ended = true;

    // 启动缓冲：只约束第一句——未到 0.5s 且首句未收完 → 先攒着；首句收完 → 立即启动
    const first = this.slots[0];
    const threshold = Math.floor(first.sampleRate * 2 * START_BUFFER_SEC);
    const buffered = first.received - first.scheduledBytes;
    if (!this.started && !first.ended && buffered < threshold) return;

    this.flush();
  }

  /** 把各句已缓冲的完整采样按顺序全部排进音频时钟 */
  private flush(): void {
    if (!this.ctx) return;
    for (const slot of this.slots) {
      const total = slot.received - slot.scheduledBytes;
      if (total <= 0) continue;
      const merged = new Uint8Array(total);
      let off = 0;
      // 已排程的部分留在数组头部：简化起见每次全部重建（句子级数据量小）
      let skip = slot.scheduledBytes;
      for (const chunk of slot.bytes) {
        if (skip >= chunk.byteLength) {
          skip -= chunk.byteLength;
          continue;
        }
        merged.set(chunk.subarray(skip), off);
        off += chunk.byteLength - skip;
        skip = 0;
      }
      this.scheduleBuffer(merged.buffer, slot.sampleRate, slot);
      slot.scheduledBytes = slot.received;
      slot.bytes = [];
    }
    this.maybeAck();
  }

  private scheduleBuffer(bytes: ArrayBuffer, sampleRate: number, slot: SentenceSlot): void {
    if (!this.ctx) return;
    const view = new DataView(bytes);
    const n = bytes.byteLength / 2;
    const buf = this.ctx.createBuffer(1, n, sampleRate);
    const dst = buf.getChannelData(0);
    for (let i = 0; i < n; i++) dst[i] = view.getInt16(i * 2, true) / 32768;

    const at = Math.max(this.nextTime || 0, this.ctx.currentTime + SCHEDULE_AHEAD_SEC);
    const source = this.ctx.createBufferSource();
    source.buffer = buf;
    source.connect(this.ctx.destination);
    slot.playing++;
    this.nodes.add(source);
    source.onended = () => {
      this.nodes.delete(source);
      slot.playing--;
      this.maybeAck();
    };
    source.start(at);
    this.nextTime = at + n / sampleRate;
    if (!this.started) {
      this.started = true;
      this.cb.onTimelineStart?.();
    }
  }

  /** 背压等待：直到 acked >= min（可取消；取消返回 false） */
  waitAck(min: number, signal: AbortSignal, timeoutMs = 60_000): Promise<boolean> {
    if (this.acked >= min) return Promise.resolve(true);
    return new Promise((resolve) => {
      const waiter = { min, resolve };
      this.waiters.push(waiter);
      const timer = window.setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        resolve(false);
      }, timeoutMs);
      const onAbort = () => {
        window.clearTimeout(timer);
        this.waiters = this.waiters.filter((w) => w !== waiter);
        resolve(false);
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private maybeAck(): void {
    if (this.canceled) return;
    // 从队首起，把已收完、已排程且播完的句子逐个确认（单调前进，绝不回退）
    for (;;) {
      const slot = this.slots[0];
      if (!slot || !slot.ended || slot.scheduledBytes < slot.received || slot.playing > 0) break;
      if (slot.k <= this.acked) {
        this.slots.shift();
        continue;
      }
      this.acked = slot.k;
      this.slots.shift();
      this.cb.onSentencePlayed?.(this.acked);
    }
    const ready = this.waiters.filter((w) => this.acked >= w.min);
    this.waiters = this.waiters.filter((w) => this.acked < w.min);
    ready.forEach((w) => w.resolve(true));
    if (this.slots.length === 0) this.cb.onIdle?.();
  }

  /** 挂断：取消全部排程与等待，迟到音频不再响 */
  cancel(): void {
    this.canceled = true;
    for (const node of this.nodes) {
      try {
        node.onended = null;
        node.stop();
      } catch {
        /* ignore */
      }
    }
    this.nodes.clear();
    this.slots = [];
    const waiters = this.waiters;
    this.waiters = [];
    waiters.forEach((w) => w.resolve(false));
  }

  /** 回合间隙软复位（保持 AudioContext 复用，不重新建立连接） */
  resetForNextTurn(): void {
    this.canceled = false;
    this.slots = [];
    this.started = false;
  }
}

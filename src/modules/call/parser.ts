/**
 * call/parser.ts — 稳定语音单元解析（StarHub 教程 §5 / §8 的前端落地）
 * MUST：发布前缀只能追加，不能撤回重写；未成句尾部由 parser 持有，finish() 只调用一次。
 * 两种模式：
 *  · plain     单语：按句末标点切稳定句，保留未闭合尾部；
 *  · bilingual 双语：EN:/ZH: 成对行协议，读到下一条完整 spoken 行才释放前一组；
 *    合成只用 spoken 行，释义只进字幕。
 */

export interface SpeechUnit {
  /** 送入合成的文本（清理过控制标签） */
  speech: string;
  /** 字幕（对方看到的台词；单语时与 speech 相同） */
  caption: string;
  /** 可选释义（字幕区的第二行；单语时为空） */
  gloss?: string;
}

const RE_THOUGHT = /\[\[THOUGHT:[\s\S]*?(?:\]\]|$)/g;
/** 字幕里去掉声音/控制标签，如 [voice:耳语]（教程 §3：合成可保留，字幕必须干净） */
const RE_VOICE_TAG = /\[[^\]\n]{1,24}\]/g;

/** 清理合成文本：去掉双方思考旁白块与多余空白 */
export function cleanSpeechText(text: string): string {
  return text.replace(RE_THOUGHT, "").replace(/[ \t]+\n/g, "\n").trim();
}

/** 清理字幕：再去掉声音标签 */
export function cleanCaption(text: string): string {
  return cleanSpeechText(text).replace(RE_VOICE_TAG, "").trim();
}

/** 单语成句切分：返回 [完整句数组, 未闭合尾部] */
function splitPlainTail(tail: string): [string[], string] {
  const units: string[] = [];
  let rest = tail;
  // 中文句末 + 英文句末 + 省略号/换行收束
  const re = /[^。！？!?\.\n…]*[。！？!?…]+[」』”』）)]*|[^\n]+(?=\n)/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(rest)) !== null) {
    const piece = m[0].trim();
    if (piece) units.push(piece);
    last = re.lastIndex;
  }
  rest = rest.slice(last);
  // 换行本身也可收束一句（双语模式之外的兜底）
  const nl = rest.indexOf("\n");
  if (nl >= 0) {
    const head = rest.slice(0, nl).trim();
    if (head) units.push(head);
    rest = rest.slice(nl + 1);
  }
  return [units, rest];
}

/**
 * 双语行解析（教程 §8 PairParser 的 TS 版）。
 * 协议：每组恰好两行，spoken 行 + 释义行（EN/ZH 标记）；读到下一条完整 spoken 行才释放前一组。
 */
class PairParser {
  private buf = "";
  private spoken: string | null = null;
  private gloss: string | null = null;
  private spokenLabel: "EN" | "ZH";

  constructor(spokenLabel: "EN" | "ZH") {
    this.spokenLabel = spokenLabel;
  }

  private line(line: string, out: SpeechUnit[]) {
    const t = line.trim();
    if (!t) return;
    if (t.startsWith("EN:") || t.startsWith("ZH:")) {
      const label = t.slice(0, 2) as "EN" | "ZH";
      const value = t.slice(3).trim();
      if (!value) throw new Error("empty bilingual line");
      if (label === this.spokenLabel) {
        if (this.spoken !== null) {
          if (this.gloss === null) throw new Error("missing gloss line");
          out.push(this.unit(this.spoken, this.gloss));
        }
        this.spoken = value;
        this.gloss = null;
      } else {
        if (this.spoken === null) throw new Error("gloss before spoken line");
        if (this.gloss !== null) throw new Error("duplicate gloss line");
        this.gloss = value;
      }
      return;
    }
    // 容忍模型把两行 protocol 之外的闲聊混进来：并入当前 spoken 行
    if (this.spoken !== null && this.gloss === null) this.spoken += t;
    else throw new Error(`invalid bilingual line: ${t.slice(0, 24)}`);
  }

  private unit(spoken: string, gloss: string): SpeechUnit {
    return {
      speech: cleanSpeechText(spoken),
      caption: cleanCaption(spoken),
      gloss: cleanCaption(gloss),
    };
  }

  feed(delta: string, out: SpeechUnit[]) {
    this.buf += delta;
    let idx: number;
    while ((idx = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 1);
      this.line(line, out);
    }
  }

  finish(out: SpeechUnit[]) {
    if (this.buf.trim()) this.line(this.buf, out);
    this.buf = "";
    if (this.spoken !== null) {
      if (this.gloss === null) throw new Error("missing gloss line at end");
      out.push(this.unit(this.spoken, this.gloss));
      this.spoken = null;
      this.gloss = null;
    }
  }
}

/** 稳定语音单元解析器（流式 feed + 一次性 finish） */
export class SpeechParser {
  private published = "";
  private tail = "";
  private pair: PairParser | null = null;
  private finished = false;
  private bilingual: boolean;

  constructor(bilingual: boolean, spokenLabel: "EN" | "ZH" = "EN") {
    this.bilingual = bilingual;
    if (bilingual) this.pair = new PairParser(spokenLabel);
  }

  /**
   * 喂入新增文本（必须是已发布前缀的增量）。
   * 返回本次释放出的稳定语音单元。
   */
  feed(snapshot: string): SpeechUnit[] {
    if (this.finished) throw new Error("parser already finished");
    const stable = cleanSpeechText(snapshot);
    if (!stable.startsWith(this.published)) {
      // 清理可能造成的前缀抖动（如尾部标签被收走）：取公共前缀，不撤回已发布内容
      let common = 0;
      const max = Math.min(stable.length, this.published.length);
      while (common < max && stable[common] === this.published[common]) common++;
      if (common < this.published.length) {
        throw new Error("published prefix changed");
      }
    }
    const delta = stable.slice(this.published.length);
    this.published = stable;
    return this.take(delta);
  }

  private take(delta: string): SpeechUnit[] {
    const out: SpeechUnit[] = [];
    if (this.bilingual && this.pair) {
      this.pair.feed(delta, out);
      return out;
    }
    const [units, tail] = splitPlainTail(this.tail + delta);
    this.tail = tail;
    for (const u of units) {
      const speech = cleanSpeechText(u);
      if (!speech) continue;
      out.push({ speech, caption: cleanCaption(u) });
    }
    return out;
  }

  /** 流结束：最终解析，释放剩余正文；只能调用一次 */
  finish(): SpeechUnit[] {
    if (this.finished) throw new Error("finish() called twice");
    this.finished = true;
    const out: SpeechUnit[] = [];
    if (this.bilingual && this.pair) {
      this.pair.finish(out);
      return out;
    }
    const rest = cleanSpeechText(this.tail);
    this.tail = "";
    if (rest) out.push({ speech: rest, caption: cleanCaption(rest) });
    return out;
  }

  /** 当前已发布前缀（用于保存聊天记录） */
  get text(): string {
    return this.published;
  }
}

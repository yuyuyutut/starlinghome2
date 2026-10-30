/**
 * call/CallScreen.tsx — 全屏通话界面（磨砂灰调，与全站一致）
 * 上半：TA 的头像呼吸圆盘 + 状态文案；中部：字幕（spoken + 可选释义）+ 你的识别文本；
 * 下半：语言快照选择（只影响下一轮）+ 挂断。思考与播放期间不开麦（轮流说话，无插话）。
 */
import type { Companion } from "@/hooks/useCompanion";
import { CALL_LANGS, type CallLang } from "./config";
import { useCall } from "./useCall";

const PHASE_TEXT: Record<string, string> = {
  listening: "正在听…",
  thinking: "TA 在想…",
  speaking: "TA 在说…",
  ended: "通话结束",
};

function LangChip({
  value,
  current,
  onPick,
}: {
  value: CallLang;
  current: CallLang;
  onPick: (v: CallLang) => void;
}) {
  return (
    <button
      onClick={() => onPick(value)}
      className={`rounded-full px-3.5 py-1 text-[12px] tracking-wide transition-all ${
        current === value ? "bg-black/[0.12] font-medium text-[#1f1f1f]" : "text-black/40 hover:text-black/60"
      }`}
    >
      {CALL_LANGS[value].label}
    </button>
  );
}

export function CallScreen({ c }: { c: Companion }) {
  const { state, hangUp, setLang } = useCall(c);
  if (!state.active) return null;

  const lastCaption = state.captions[state.captions.length - 1];
  const minutes = Math.floor((Date.now() - state.startedAt) / 60000);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#e8e6e1] via-[#efeeea] to-[#e6e4df]">
      {/* 顶部：状态 + 时长 */}
      <div className="flex items-center justify-between px-6 pt-8">
        <div className="font-script text-[20px] text-black/50">Appel</div>
        <div className="font-caption text-[12px] italic text-black/40">
          {minutes > 0 ? `${minutes} min` : "à l'écoute"}
        </div>
      </div>

      {/* 头像圆盘 */}
      <div className="mt-10 flex flex-col items-center">
        <div
          className={`grid size-28 place-items-center rounded-full bg-black/[0.06] text-4xl text-black/50 ring-1 ring-black/10 ${
            state.phase === "speaking" ? "animate-heart-pop" : "animate-breathe"
          }`}
        >
          {c.card.avatar || "🦊"}
        </div>
        <div className="mt-4 text-[16px] font-normal tracking-wide text-[#1f1f1f]">{c.card.name}</div>
        <div className="font-caption mt-1 text-[13px] italic text-black/45">
          {PHASE_TEXT[state.phase] ?? ""}
          {state.interim && <span className="text-black/55">「{state.interim}」</span>}
        </div>
      </div>

      {/* 字幕区 */}
      <div className="mx-6 mt-8 flex min-h-[128px] flex-1 flex-col items-center overflow-y-auto rounded-[28px] bg-white/25 px-5 py-4 text-center">
        {lastCaption ? (
          <>
            <div className="text-[16px] font-normal leading-relaxed text-[#262626]">{lastCaption.unit.caption}</div>
            {lastCaption.unit.gloss && (
              <div className="font-caption mt-2 text-[13px] italic leading-relaxed text-black/45">
                {lastCaption.unit.gloss}
              </div>
            )}
          </>
        ) : (
          state.phase === "listening" && (
            <div className="font-caption self-center text-[13px] italic text-black/35">
              {state.emptyHears > 2 ? "没听清——靠近一点说，或者说得再慢些" : "说点什么吧，说完停口我就能听到"}
            </div>
          )
        )}
        {state.notice && <div className="font-caption mt-3 text-[12px] text-rose/80">{state.notice}</div>}
      </div>

      {/* 语言快照（本轮已固定，切换只影响下一轮；教程 §3/§8） */}
      <div className="mx-6 mt-4 flex items-center justify-center gap-2 text-[12px] text-black/45">
        <span>我说</span>
        <div className="glass flex rounded-full p-0.5">
          {(Object.keys(CALL_LANGS) as CallLang[]).map((l) => (
            <LangChip key={l} value={l} current={state.langs.input} onPick={(v) => setLang("input", v)} />
          ))}
        </div>
        <span className="ml-2">TA 说</span>
        <div className="glass flex rounded-full p-0.5">
          {(Object.keys(CALL_LANGS) as CallLang[]).map((l) => (
            <LangChip key={l} value={l} current={state.langs.output} onPick={(v) => setLang("output", v)} />
          ))}
        </div>
      </div>

      {/* 挂断 */}
      <div className="flex justify-center py-10">
        <button
          onClick={() => hangUp()}
          aria-label="挂断"
          className="grid size-14 place-items-center rounded-full bg-[#2b2b2b] text-white shadow-lg transition-transform hover:scale-105"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z" transform="rotate(135 12 12)" />
          </svg>
        </button>
      </div>
    </div>
  );
}

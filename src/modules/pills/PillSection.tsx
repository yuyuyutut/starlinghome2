/**
 * pills/PillSection.tsx — 药丸图鉴（「应用」面板里的可折叠板块）
 * 手动挑一颗药挂到自己的下一句话上：只作用下一次回复，用完即焚。
 * 灵感来自开源项目 pilulier（MIT）：https://github.com/ceshihaox-dotcom/pilulier
 */
import { useState } from "react";
import { pillImg } from "@/assets/pills";
import { MAX_PILLS, PILLS } from "./pills";
import { attachPill, clearPills, detachPill, useAttachedPills } from "./store";

/** 单颗药：点按展开药方全文，再点「挂上 / 放回」 */
function PillRow({ code }: { code: string }) {
  const pill = PILLS.find((p) => p.code === code)!;
  const attached = useAttachedPills();
  const on = attached.some((a) => a.code === code);
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const toggleAttach = () => {
    if (on) {
      detachPill(code);
      setHint(null);
    } else {
      setHint(attachPill(code));
    }
  };

  return (
    <div className="px-3.5 py-2.5">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group flex w-full items-center gap-3 text-left"
      >
        <span
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-all ${
            on ? "border-black/30 bg-white/60 shadow-sm" : "border-black/[0.09] bg-white/30"
          }`}
        >
          <img src={pillImg(pill.code)} alt="" draggable={false} className={`h-8 w-8 object-contain ${on ? "" : "opacity-70"} group-hover:opacity-100`} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="font-caption text-[11px] tracking-wider text-black/35">{pill.code}</span>
            <span className={`text-[14px] font-normal ${on ? "text-[#2b2b2b]" : "text-[#2b2b2b]/85"}`}>
              {pill.name}
              {on && <span className="ml-1.5 text-[11px] text-rose">✓ 已挂</span>}
            </span>
          </span>
          <span className="font-caption mt-0.5 block truncate text-[12px] leading-snug text-black/45">{pill.scene}</span>
        </span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-black/35 transition-transform duration-300 group-hover:text-black/55 ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="bubble-in mt-2.5">
          {/* 药方全文（手稿框） */}
          <button
            onClick={() => setOpen(false)}
            title="点击收起"
            className="font-caption block w-full rounded-2xl border border-black/[0.12] bg-white/25 px-3.5 py-2.5 text-left text-[12.5px] leading-relaxed text-black/55 transition-colors hover:bg-white/40"
          >
            <span className="mb-1 block text-[11px] tracking-widest text-black/35">Rx · {pill.code}</span>
            {pill.body}
          </button>
          <div className="mt-2 flex items-center gap-2 pl-1">
            <button
              onClick={toggleAttach}
              className={`h-8 rounded-full px-4 text-[12.5px] tracking-wide transition-colors ${
                on
                  ? "border border-black/20 text-black/60 hover:bg-black/[0.05]"
                  : "bg-[#2b2b2b] text-white hover:bg-black"
              }`}
            >
              {on ? "放回" : "挂上 · 下一次回复服用"}
            </button>
            {hint && <span className="font-caption text-[12px] text-rose/80">{hint}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function PillSection() {
  const attached = useAttachedPills();

  return (
    <div className="space-y-3">
      <p className="font-caption text-[12.5px] leading-relaxed text-black/45">
        — 挑一颗药挂在自己的下一句话上：药丸会排在那句话前面一起发给模型，
        <span className="text-black/60">只作用下一次回复</span>，用完即焚，聊天记录里不会留下。
      </p>

      {/* 已挂摘要 */}
      {attached.length > 0 && (
        <div className="bubble-in flex items-center justify-between rounded-2xl bg-black/[0.04] px-3.5 py-2">
          <span className="font-caption truncate text-[12.5px] text-black/55">
            已挂 {attached.map((a) => `${a.code}·${a.name}`).join("、")} · 下一次回复服用
          </span>
          <button onClick={clearPills} className="shrink-0 pl-2 text-[12px] text-black/40 transition-colors hover:text-rose">
            全部放回
          </button>
        </div>
      )}

      {/* 药丸图鉴（treize gélules） */}
      <div className="divide-y divide-black/[0.07] overflow-hidden rounded-2xl border border-black/[0.09] bg-white/30">
        {PILLS.map((p) => (
          <PillRow key={p.code} code={p.code} />
        ))}
      </div>

      <p className="font-caption text-center text-[12px] text-black/35">
        treize gélules · 一次最多挂 {MAX_PILLS} 颗 · une gélule, une réponse
      </p>
    </div>
  );
}

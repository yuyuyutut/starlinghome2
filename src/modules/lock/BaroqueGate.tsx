/**
 * BaroqueGate — 巴洛克大门开屏：
 * 白色巴洛克双扇大门静静矗立，门缝透出微光；点击后门扇向两侧徐徐打开、
 * 光华溢出，随后整体淡出，由父组件接管切换到密码锁页（onOpen）。
 * 插画由 AI 生成（见 assets/gate.ts，左右两半拼合，开门时分别向两侧滑开）。
 */
import { useState } from "react";
import { GATE_LEFT, GATE_RIGHT } from "@/assets/gate";

export function BaroqueGate({ onOpen }: { onOpen: () => void }) {
  const [opening, setOpening] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const open = () => {
    if (opening) return;
    setOpening(true);
    // 门扇滑开后稍停一息，整幅画面淡出交给密码锁页
    window.setTimeout(() => setLeaving(true), 620);
    window.setTimeout(onOpen, 1050);
  };

  return (
    <div
      className={`flex h-full flex-col items-center pt-[8vh] transition-all duration-500 ${
        leaving ? "-translate-y-6 opacity-0" : "opacity-100"
      }`}
    >
      <button onClick={open} aria-label="叩开大门" className="group relative outline-none">
        {/* 门缝光华：常态微光呼吸，开门时亮起 */}
        <div
          className={`absolute inset-y-4 left-1/2 z-10 w-24 -translate-x-1/2 rounded-full bg-white blur-2xl transition-opacity duration-700 ${
            opening ? "opacity-90" : "animate-breathe opacity-40"
          }`}
        />
        {/* 左右两扇拼合；开门时分别向两侧滑开（平移百分比相对各自半宽） */}
        <div className="flex group-active:scale-[0.995] transition-transform duration-300">
          <img
            src={GATE_LEFT}
            alt=""
            draggable={false}
            className={`h-[46vh] w-auto select-none object-contain drop-shadow-[0_20px_36px_rgba(43,43,43,0.16)] transition-transform duration-700 ease-[cubic-bezier(0.34,1.1,0.5,1)] ${
              opening ? "-translate-x-[38%]" : ""
            }`}
          />
          <img
            src={GATE_RIGHT}
            alt=""
            draggable={false}
            className={`h-[46vh] w-auto select-none object-contain drop-shadow-[0_20px_36px_rgba(43,43,43,0.16)] transition-transform duration-700 ease-[cubic-bezier(0.34,1.1,0.5,1)] ${
              opening ? "translate-x-[38%]" : ""
            }`}
          />
        </div>
      </button>

      <div className="mt-[6vh] text-center">
        <p className="font-script text-[26px] text-black/70">Le Portail</p>
        <p className="font-caption mt-2 text-[13px] tracking-[0.2em] text-black/40">
          — 轻叩门扉，叩开小筑
        </p>
      </div>
    </div>
  );
}

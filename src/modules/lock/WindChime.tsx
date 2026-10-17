/**
 * WindChime — 风铃开屏：玻璃风铃微微晃动，点击下方的纸笺绳结把绳子拉下。
 * 拉下后纸笺回弹、风铃大幅摆动，由父组件接管切换（onPulled）。
 */
import { useState } from "react";
import { WINDCHIME } from "@/assets-gen";

export function WindChime({ onPulled }: { onPulled: () => void }) {
  const [pulling, setPulling] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const pull = () => {
    if (pulling) return;
    setPulling(true);
    // 绳子先被拉长，随后风铃晃开、整幅画面淡出交给门锁页
    window.setTimeout(() => setLeaving(true), 420);
    window.setTimeout(onPulled, 900);
  };

  return (
    <div
      className={`flex h-full flex-col items-center pt-[10vh] transition-all duration-500 ${
        leaving ? "-translate-y-6 opacity-0" : "opacity-100"
      }`}
    >
      {/* 风铃主体：绕顶部挂点轻摆 */}
      <div className={`chime-sway ${pulling ? "chime-sway-hard" : ""}`}>
        <img
          src={WINDCHIME}
          alt="风铃"
          draggable={false}
          className="h-[40vh] w-auto select-none object-contain drop-shadow-[0_18px_30px_rgba(43,43,43,0.14)]"
        />
        {/* 拉绳（风铃纸笺）：点击后向下拉长 */}
        <button
          onClick={pull}
          aria-label="拉一下风铃"
          className="group -mt-1 flex w-16 flex-col items-center outline-none"
        >
          <span
            className={`block w-px bg-gradient-to-b from-black/35 to-black/15 transition-all duration-300 ease-out ${
              pulling ? "h-24" : "h-14 group-active:h-20"
            }`}
          />
          <span
            className={`mt-1 block h-9 w-5 rounded-b-lg rounded-t-sm border border-black/10 bg-white/75 shadow-[0_4px_10px_rgba(43,43,43,0.12)] backdrop-blur-sm transition-all duration-300 ${
              pulling ? "translate-y-3 rotate-3" : "group-active:translate-y-2"
            }`}
          />
        </button>
      </div>

      <div className="mt-[7vh] text-center">
        <p className="font-script text-[26px] text-black/70">Le Carillon</p>
        <p className="font-caption mt-2 text-[13px] tracking-[0.2em] text-black/40">
          — 轻拉绳结，叩开小筑
        </p>
      </div>
    </div>
  );
}

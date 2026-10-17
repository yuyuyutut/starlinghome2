/**
 * pills/PillChip.tsx — 聊天输入栏上方的「已挂药丸」提示条
 * 挂着药时显示；点 ✕ 全部放回。发送后由 send 取走（用完即焚），无需在此处理。
 */
import { pillImg } from "@/assets/pills";
import { clearPills, useAttachedPills } from "./store";

export function PillChip() {
  const attached = useAttachedPills();
  if (attached.length === 0) return null;

  return (
    <div className="bubble-in mb-2 flex items-center gap-2 pl-1">
      <img src={pillImg(attached[0].code)} alt="" draggable={false} className="h-6 w-6 object-contain" />
      <span className="glass truncate rounded-full px-3 py-1.5 text-[12px] tracking-wide text-black/60">
        已挂 {attached.map((a) => `${a.code}·${a.name}`).join("、")} · 下一次回复服用
      </span>
      <button
        onClick={clearPills}
        aria-label="放回全部药丸"
        title="放回全部药丸"
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-black/10 text-[11px] text-black/60 transition-colors hover:bg-black/20"
      >
        ✕
      </button>
    </div>
  );
}

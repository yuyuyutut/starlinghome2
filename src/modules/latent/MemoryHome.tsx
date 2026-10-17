/**
 * latent/MemoryHome.tsx — 「记忆」Tab 的视图外壳
 * 列表（显影分区管理）与山屋（可视化小屋）两种看法切换；
 * 山屋默认关，开在设置里（对齐原版 hut 默认关）。
 */
import { useState } from "react";
import type { Companion } from "@/hooks/useCompanion";
import { LatentPanel } from "./LatentPanel";
import { HutPanel } from "./hut/HutPanel";

export function MemoryHome({ c }: { c: Companion }) {
  const [view, setView] = useState<"list" | "hut">("list");
  const hut = c.settings.hutEnabled;

  return (
    <div className="flex h-full flex-col">
      {hut && (
        <div className="flex shrink-0 justify-center pt-3">
          <div className="glass-deep flex rounded-full p-1">
            {(["list", "hut"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-4 py-1.5 text-[12px] tracking-widest transition-all ${
                  view === v ? "bg-black/[0.07] text-[#1f1f1f]" : "text-black/45 hover:text-black/60"
                }`}
              >
                {v === "list" ? "显影" : "山屋"}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1">
        {view === "hut" && hut ? <HutPanel c={c} /> : <LatentPanel c={c} />}
      </div>
    </div>
  );
}

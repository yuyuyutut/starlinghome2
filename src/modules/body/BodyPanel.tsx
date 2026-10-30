/**
 * body/BodyPanel.tsx — 底部导航「生理」面板（Eventide 宿主 UI）
 * 周期卡片 + 主事件卡片 + 七项身体数值（档位 + 进度条）。
 * 数值经由 <ephemeral_state> 状态卡注入模型上下文，本页只作展示。
 */
import { useEffect, useState } from "react";
import type { Companion } from "@/hooks/useCompanion";
import { BODY_FIELDS } from "./config";
import { bodyStatePayload, cycleRemaining, eventRemaining } from "./card";
import { tickBodyForChar, resetBodyState, useBody } from "./store";
import { CYCLES, EVENTS } from "./config";

const LEVEL_COLOR: Record<string, string> = {
  低: "text-black/40",
  中低: "text-black/50",
  中: "text-black/60",
  中高: "text-black/75",
  高: "text-black/90",
};

export function BodyPanel({ c }: { c: Companion }) {
  const state = useBody(c.charId);
  const [now, setNow] = useState(() => Date.now());

  /* 打开面板时先推进一次时间；30 秒刷一次倒计时 */
  useEffect(() => {
    const lastUserTs =
      [...c.messages].reverse().find((m) => m.role === "user")?.ts ?? null;
    tickBodyForChar(c.charId, lastUserTs);
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.charId]);

  if (!state) return null;

  const cycle = CYCLES[state.cycleKey] ?? CYCLES.stable;
  const event = state.activeEventKey ? EVENTS[state.activeEventKey] : null;
  const payload = bodyStatePayload(state);
  const cycleProgress = state.cycleExpiresAt > state.cycleStartedAt
    ? Math.min(1, Math.max(0, (now - state.cycleStartedAt) / (state.cycleExpiresAt - state.cycleStartedAt)))
    : 0;

  return (
    <div className="h-full overflow-y-auto px-4 pb-4 pt-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="font-script text-[28px] leading-none text-[#1f1f1f]">Eventide</div>
          <div className="font-caption mt-1 text-[13px] text-black/45">身体涨落 · 随时间与互动自然推进</div>
        </div>
        <button
          onClick={() => {
            resetBodyState(c.charId);
            setNow(Date.now());
          }}
          className="font-caption rounded-full border border-black/10 bg-white/30 px-3 py-1 text-[11px] italic text-black/45 transition-colors hover:text-black/70"
        >
          重置状态
        </button>
      </div>

      <div className="space-y-4">
        {/* 当前周期 */}
        <div className="glass-deep rounded-[28px] p-5">
          <div className="flex items-baseline justify-between">
            <div className="font-script text-[24px] leading-none text-[#1f1f1f]">{cycle.label}</div>
            <div className="font-caption text-[12px] italic text-black/45">还剩 {cycleRemaining(state, now)}</div>
          </div>
          <p className="mt-2.5 text-[13px] font-normal leading-relaxed text-black/60">{cycle.description}</p>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/[0.07]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-black/25 to-black/45 transition-all duration-700"
              style={{ width: `${Math.round(cycleProgress * 100)}%` }}
            />
          </div>
          <div className="font-caption mt-1.5 text-[11px] italic text-black/35">
            周期随时间自然流转：平稳 → 蓄积 → 预兆 → 易感 → 退潮
          </div>
        </div>

        {/* 主事件 */}
        {event && (
          <div className="glass-deep rounded-[28px] p-5 ring-1 ring-black/[0.08]">
            <div className="flex items-baseline justify-between">
              <div className="font-script text-[22px] leading-none text-[#1f1f1f]">{event.label}</div>
              <div className="font-caption text-[12px] italic text-black/45">还剩 {eventRemaining(state, now)}</div>
            </div>
            <p className="mt-2.5 text-[13px] font-normal leading-relaxed text-black/60">{event.prompt}</p>
            <div className="font-caption mt-2 text-[11px] italic text-black/35">
              这段只注入本轮模型上下文，不会写进聊天记录
            </div>
          </div>
        )}

        {/* 七项身体数值 */}
        <div className="glass-deep rounded-[28px] p-5">
          <div className="font-script text-[22px] leading-none text-[#1f1f1f]">Corps</div>
          <div className="font-caption mt-1 text-[12px] text-black/45">七项数值 · 档位描述注入状态卡</div>
          <div className="mt-4 space-y-3.5">
            {BODY_FIELDS.map((field) => {
              const p = payload[field];
              return (
                <div key={field}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[13px] font-normal text-black/70">{p.label}</span>
                    <span className={`font-caption text-[12px] ${LEVEL_COLOR[p.level] ?? "text-black/50"}`}>
                      {p.level} · {p.value}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-black/[0.07]">
                    <div
                      className="h-full rounded-full bg-black/40 transition-all duration-700"
                      style={{ width: `${p.value}%` }}
                    />
                  </div>
                  <div className="font-caption mt-1 text-[11px] italic leading-relaxed text-black/35">{p.description}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 说明 */}
        <div className="font-caption px-2 pb-2 text-[11px] italic leading-relaxed text-black/35">
          每轮发消息前按时间推进身体状态，并按触发表抽取短时事件；状态以 &lt;ephemeral_state&gt;
          隐藏卡片进入系统提示词，过期即失效。生理内核移植自 Eventide（Chuli @chuli1122，PolyForm Noncommercial 1.0.0）
        </div>
      </div>
    </div>
  );
}

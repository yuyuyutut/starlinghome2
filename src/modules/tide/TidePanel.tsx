/**
 * tide/TidePanel.tsx — 底部导航「心潮」面板
 * 直连心潮·念 动态心念引擎的 dashboard 投影：
 *   Les Courants  驱力潮位（11 项 + 花蕊三值）
 *   L'Humeur      当前心绪与痕迹
 *   Les Signaux   信号（24h 内 TA 留意到的事）
 *   Les Rêves     梦境与余韵
 *   L'Encre       人格锚点与维度
 * 数据来自远端心潮服务，设置见「设置 · 心潮引擎」。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Companion } from "@/hooks/useCompanion";
import { loadSettings, type Settings } from "@/lib/db";
import {
  DRIVE_LEVEL_ZH,
  driveLevel,
  fetchTideSnapshot,
  normalizeTideBase,
  shortDate,
  timeAgo,
  type TideDrive,
  type TideSnapshot,
} from "./client";

const LEVEL_TEXT: Record<string, string> = {
  quiet: "text-black/40",
  present: "text-black/55",
  rising: "text-black/75",
  surging: "text-black/90",
};

const LEVEL_BAR: Record<string, string> = {
  quiet: "from-black/10 to-black/15",
  present: "from-black/20 to-black/30",
  rising: "from-black/35 to-black/50",
  surging: "from-black/55 to-black/75",
};

type LoadState = { kind: "idle" } | { kind: "loading" } | { kind: "error"; message: string };

function pct(d: TideDrive): number {
  if (typeof d.percent === "number") return Math.min(100, Math.max(0, d.percent));
  return Math.min(100, Math.max(0, Math.round((d.value ?? 0) * 100)));
}

export function TidePanel({ c: _c }: { c: Companion }) {
  const [cfg] = useState<Settings>(() => loadSettings());
  const base = normalizeTideBase(cfg.xinchaoBaseUrl);
  const token = cfg.xinchaoToken.trim();
  const configured = base !== "" && token !== "";

  const [snap, setSnap] = useState<TideSnapshot | null>(null);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const seq = useRef(0);

  const load = useCallback(
    async (silent = false) => {
      if (!configured) return;
      const mySeq = ++seq.current;
      if (!silent) setState({ kind: "loading" });
      try {
        const s = await fetchTideSnapshot(base, token);
        if (mySeq !== seq.current) return;
        setSnap(s);
        setUpdatedAt(Date.now());
        setState({ kind: "idle" });
      } catch (e) {
        if (mySeq !== seq.current) return;
        setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      }
    },
    [configured, base, token]
  );

  /* 打开面板即拉取，并按设置的间隔轮询（面板关闭即停） */
  useEffect(() => {
    if (!configured) return;
    load();
    const iv = window.setInterval(() => load(true), Math.max(10, cfg.xinchaoPollSec || 30) * 1000);
    return () => window.clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, base, token]);

  const name = snap?.identity?.agentName || "心潮";

  return (
    <div className="h-full overflow-y-auto px-4 pb-4 pt-5">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="font-script text-[28px] leading-none text-[#1f1f1f]">Marée</div>
          <div className="font-caption mt-1 text-[13px] text-black/45">
            {!configured
              ? "心绪如潮 · 记录与回望"
              : state.kind === "error"
                ? "心潮 · 连接中断"
                : snap
                  ? `心潮 · ${name} 的此刻`
                  : "心潮 · 正在连接…"}
          </div>
        </div>
        {configured && (
          <div className="flex shrink-0 items-center gap-2">
            {updatedAt && (
              <span className="font-caption text-[11px] italic text-black/35">
                {timeAgo(new Date(updatedAt).toISOString())}
              </span>
            )}
            <button
              onClick={() => load()}
              disabled={state.kind === "loading"}
              className="font-caption rounded-full border border-black/10 bg-white/30 px-3 py-1 text-[11px] italic text-black/45 transition-colors hover:text-black/70 disabled:opacity-50"
            >
              {state.kind === "loading" ? "同步中…" : "⟳ 刷新"}
            </button>
          </div>
        )}
      </div>

      {/* 未配置：引导到设置 */}
      {!configured && (
        <div className="space-y-4">
          <div className="glass-deep rounded-[28px] p-5">
            <div className="font-script text-[22px] leading-none text-[#1f1f1f]">Le Flux</div>
            <p className="mt-2.5 text-[13px] font-normal leading-relaxed text-black/60">
              心潮板块已就位，尚未接入心潮·念 引擎。填写服务地址与访问令牌后，
              这里将实时呈现 TA 的驱力潮位、心绪痕迹、留意到的信号与梦境余韵。
            </p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/[0.07]">
              <div className="h-full w-1/4 rounded-full bg-gradient-to-r from-black/20 to-black/40 transition-all duration-700" />
            </div>
            <p className="font-caption mt-2 text-[12px] italic leading-relaxed text-black/40">
              连接配置在「设置 · 心潮引擎」；服务端需将本页来源加入 DASHBOARD_ALLOWED_ORIGINS
            </p>
          </div>
          <div className="glass-deep rounded-[28px] p-5">
            <div className="font-script text-[20px] leading-none text-[#1f1f1f]/85">Réserve</div>
            <p className="font-caption mt-2 text-[12px] italic leading-relaxed text-black/40">
              未接入时本页不发起任何网络请求；接入后令牌只保存在本机浏览器。
            </p>
          </div>
        </div>
      )}

      {/* 已配置：错误态 */}
      {configured && state.kind === "error" && !snap && (
        <div className="glass-deep rounded-[28px] p-5">
          <div className="font-script text-[22px] leading-none text-[#1f1f1f]">Le Silence</div>
          <p className="mt-2.5 text-[13px] font-normal leading-relaxed text-black/60">
            暂时联系不上心潮引擎：{state.message}
          </p>
          <p className="font-caption mt-2 text-[12px] italic leading-relaxed text-black/40">
            请确认服务在线、访问令牌有效，且服务端 .env 的 DASHBOARD_ALLOWED_ORIGINS 已放行本页来源
          </p>
          <button
            onClick={() => load()}
            className="font-caption mt-3 rounded-full border border-black/15 bg-black/[0.06] px-4 py-1.5 text-[12px] italic text-black/60 transition-colors hover:text-black/85"
          >
            重试连接
          </button>
        </div>
      )}

      {configured && snap && (
        <div className="space-y-4">
          {/* 驱力潮位 */}
          <div className="glass-deep rounded-[28px] p-5">
            <div className="flex items-baseline justify-between">
              <div className="font-script text-[24px] leading-none text-[#1f1f1f]">Les Courants</div>
              <div className="font-caption text-[12px] italic text-black/45">
                revision {snap.revision ?? 0} · {snap.runtime?.idleMinutes != null ? ` idle ${Math.round(snap.runtime.idleMinutes)} 分钟` : ""}
              </div>
            </div>
            <div className="mt-3 space-y-2.5">
              {snap.drives.map((d) => {
                const lv = driveLevel(d);
                return (
                  <div key={d.key} className="flex items-center gap-3">
                    <div className="w-[72px] shrink-0 truncate text-[12px] font-normal text-black/60">{d.label}</div>
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${LEVEL_BAR[lv]}`}
                        style={{ width: `${pct(d)}%` }}
                      />
                    </div>
                    <div className={`w-9 shrink-0 text-right text-[11px] font-normal ${LEVEL_TEXT[lv]}`}>
                      {DRIVE_LEVEL_ZH[lv]}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 花蕊三值 */}
            {snap.stamen && (
              <>
                <div className="hairline-b my-3" />
                <div className="space-y-2.5">
                  {(
                    [
                      ["安全感", snap.stamen.security],
                      ["自信", snap.stamen.confidence],
                      ["心情", snap.stamen.mood],
                    ] as const
                  ).map(([label, v]) => (
                    <div key={label} className="flex items-center gap-3">
                      <div className="w-[72px] shrink-0 text-[12px] font-normal text-black/60">{label}</div>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-black/25 to-black/45 transition-all duration-700"
                          style={{ width: `${Math.min(100, Math.max(0, Math.round((v ?? 0) * 100)))}%` }}
                        />
                      </div>
                      <div className="w-9 shrink-0 text-right text-[11px] text-black/45">{Math.round((v ?? 0) * 100)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
            <p className="font-caption mt-3 text-[11px] italic leading-relaxed text-black/35">
              驱力在心潮引擎内随对话与时间自然涨落 · 同步自 {name} 的 dashboard 投影
            </p>
          </div>

          {/* 心绪 */}
          {snap.emotion && (
            <div className="glass-deep rounded-[28px] p-5">
              <div className="flex items-baseline justify-between">
                <div className="font-script text-[22px] leading-none text-[#1f1f1f]">L'Humeur</div>
                <div className="font-caption text-[12px] italic text-black/45">
                  {snap.emotion.days != null ? `近 ${snap.emotion.days} 天的痕迹` : "心绪留痕"}
                </div>
              </div>
              {(() => {
                const s = snap.emotion!.summary;
                const text = s
                  ? (s as Record<string, unknown>).label ||
                    (s as Record<string, unknown>).text ||
                    (s as Record<string, unknown>).name ||
                    JSON.stringify(s)
                  : null;
                return text ? (
                  <p className="mt-2.5 text-[13px] font-normal leading-relaxed text-black/60">{String(text)}</p>
                ) : null;
              })()}
              {snap.emotion.marks && snap.emotion.marks.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {snap.emotion.marks.slice(0, 5).map((m, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-[12px]">
                      <span className="shrink-0 text-black/35">{timeAgo(m.at)}</span>
                      <span className="truncate font-normal text-black/60">{m.label || m.note || "一次心绪波动"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 信号 */}
          {snap.signals?.recent && snap.signals.recent.length > 0 && (
            <div className="glass-deep rounded-[28px] p-5">
              <div className="flex items-baseline justify-between">
                <div className="font-script text-[22px] leading-none text-[#1f1f1f]">Les Signaux</div>
                <div className="font-caption text-[12px] italic text-black/45">
                  24 小时内 {snap.signals.last24h ?? snap.signals.recent.length} 条
                </div>
              </div>
              <div className="mt-3 space-y-2.5">
                {snap.signals.recent.slice(0, 6).map((g, i) => (
                  <div key={i} className="border-b border-black/[0.06] pb-2.5 last:border-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[12px] font-normal text-black/70">{g.subject || g.kind || "信号"}</span>
                      <span className="font-caption shrink-0 text-[11px] italic text-black/35">{timeAgo(g.at)}</span>
                    </div>
                    {g.text && <p className="font-caption mt-1 text-[11px] italic leading-relaxed text-black/45">{g.text}</p>}
                  </div>
                ))}
              </div>
              <p className="font-caption mt-3 text-[11px] italic leading-relaxed text-black/35">
                TA 在这段沉默里留意到的事 · 会在合适的时候浮回对话
              </p>
            </div>
          )}

          {/* 梦境 */}
          {snap.dreams && snap.dreams.length > 0 && (
            <div className="glass-deep rounded-[28px] p-5">
              <div className="flex items-baseline justify-between">
                <div className="font-script text-[22px] leading-none text-[#1f1f1f]">Les Rêves</div>
                <div className="font-caption text-[12px] italic text-black/45">近 {snap.dreams.length} 场</div>
              </div>
              <div className="mt-3 space-y-2.5">
                {snap.dreams.slice(0, 6).map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 border-b border-black/[0.06] pb-2.5 last:border-0 last:pb-0">
                    <div className="min-w-0">
                      <div className="text-[12px] font-normal text-black/70">
                        {d.source === "wake" ? "醒后残梦" : d.source === "settle" ? "结算余梦" : "梦境"} · {d.mood?.valence != null ? (d.mood.valence >= 0.2 ? "偏暖" : d.mood.valence <= -0.2 ? "偏冷" : "平和") : "未定"}
                        {d.hasResidue ? " · 有余韵" : ""}
                      </div>
                      <div className="font-caption mt-0.5 text-[11px] italic text-black/40">
                        {d.hasSummary ? "已有摘要" : "尚未整理"} · 清醒度 {Math.round((d.lucidity ?? 0) * 100)}%
                      </div>
                    </div>
                    <span className="font-caption shrink-0 text-[11px] italic text-black/35">{shortDate(d.createdAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 混合心绪 */}
          {snap.mixed && (
            <div className="glass-deep rounded-[28px] p-5">
              <div className="font-script text-[22px] leading-none text-[#1f1f1f]">Le Mélange</div>
              <p className="mt-2.5 text-[13px] font-normal leading-relaxed text-black/60">
                {snap.mixed.name}
              </p>
              {snap.mixed.since && (
                <p className="font-caption mt-1 text-[11px] italic text-black/40">自 {timeAgo(snap.mixed.since)} 交织至今</p>
              )}
            </div>
          )}

          {/* 人格 */}
          {snap.personality?.available && (
            <div className="glass-deep rounded-[28px] p-5">
              <div className="flex items-baseline justify-between">
                <div className="font-script text-[22px] leading-none text-[#1f1f1f]">L'Encre</div>
                <div className="font-caption text-[12px] italic text-black/45">
                  {snap.personality.constellation || "人格锚点"}
                </div>
              </div>
              {snap.personality.anchors && snap.personality.anchors.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {snap.personality.anchors.slice(0, 8).map((a) => (
                    <span key={a.key} className="font-caption rounded-full border border-black/10 bg-white/30 px-2.5 py-0.5 text-[11px] italic text-black/55">
                      {a.label}
                    </span>
                  ))}
                </div>
              )}
              {snap.personality.dimensions && snap.personality.dimensions.length > 0 && (
                <div className="mt-3 space-y-2">
                  {snap.personality.dimensions.slice(0, 6).map((dim) => (
                    <div key={dim.key} className="flex items-center gap-3">
                      <div className="w-[72px] shrink-0 truncate text-[12px] font-normal text-black/60">{dim.label}</div>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-black/[0.07]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-black/20 to-black/40 transition-all duration-700"
                          style={{ width: `${Math.min(100, Math.max(0, Math.round((dim.score ?? 0) * 100)))}%` }}
                        />
                      </div>
                      <div className="w-9 shrink-0 text-right text-[11px] text-black/45">
                        {Math.round((dim.score ?? 0) * 100)}
                        {dim.delta != null && Math.abs(dim.delta) > 0.001 ? (
                          <span className={dim.delta > 0 ? "text-black/70" : "text-black/30"}>
                            {dim.delta > 0 ? " ↑" : " ↓"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 数据来源说明 */}
          <div className="glass-deep rounded-[28px] p-5">
            <div className="font-script text-[20px] leading-none text-[#1f1f1f]/85">Réserve</div>
            <p className="font-caption mt-2 text-[12px] italic leading-relaxed text-black/40">
              数据实时来自心潮·念 引擎（{base}），会话令牌只存本机浏览器；
              轮询间隔 {cfg.xinchaoPollSec || 30} 秒，面板关闭即停止同步。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

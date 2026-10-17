/**
 * settings/CacheSection.tsx — 设置里的「提示词缓存」模块（独立 Section）
 * Cove 实践笔记的落地：稳定人格/规则前缀与工具 schema 打 Anthropic 式 cache_control，
 * 动态情境留在普通输入；这里提供开关 + 本地观测日志（真实命中情况，不看 provider dashboard）。
 */
import { useCallback, useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import type { Settings } from "@/lib/db";
import { Section } from "./Section";
import { cacheHealth, clearCacheLog, readCacheLog, type CacheLogEvent } from "../cache/log";

function timeOf(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function CacheSection({
  form,
  onChange,
}: {
  form: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const [events, setEvents] = useState<CacheLogEvent[]>([]);
  const [health, setHealth] = useState(() => cacheHealth());

  const refresh = useCallback(() => {
    setEvents(readCacheLog().slice(-8).reverse());
    setHealth(cacheHealth());
  }, []);

  useEffect(() => {
    refresh();
    const t = window.setInterval(refresh, 2000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const u = health.usage;
  const statusColor =
    health.status === "hit"
      ? "text-emerald-600"
      : health.status === "miss"
        ? "text-amber-600"
        : health.status === "skipped"
          ? "text-black/45"
          : "text-black/45";

  return (
    <Section zh="提示词缓存" fr="Cache">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-normal leading-relaxed text-black/60">
          把每轮都稳定的人格 / 规则前缀和工具表标记为可缓存，动态情境与最新消息留在普通输入，降低重复输入成本
        </p>
        <Switch
          checked={form.promptCache}
          onCheckedChange={(v) => onChange({ promptCache: v })}
        />
      </div>
      <p className="font-caption mt-2 text-[12px] italic leading-relaxed text-black/40">
        — 适用于 Anthropic / Claude Code 形态 / 支持 cache_control 的中转；普通 OpenAI 端点会忽略这些字段。
        带图与工具回执轮自动停用缓存；同一服务商保持稳定会话 ID，不会每轮新建缓存作用域
      </p>

      {form.promptCache && (
        <div className="mt-4 space-y-3">
          {/* 命中状态 */}
          <div className="rounded-2xl border border-black/[0.08] bg-white/30 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className={`size-1.5 rounded-full ${health.status === "hit" ? "bg-emerald-500" : health.status === "miss" ? "bg-amber-500" : "bg-black/25"}`} />
              <span className={`font-caption text-[12.5px] ${statusColor}`}>{health.detail}</span>
            </div>
            {u && (
              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                <div>
                  <div className="text-[11px] text-black/40">输入</div>
                  <div className="text-[12.5px] font-medium text-black/75">{(u.input_tokens ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[11px] text-black/40">缓存读</div>
                  <div className="text-[12.5px] font-medium text-emerald-600">{(u.cache_read_input_tokens ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[11px] text-black/40">缓存建</div>
                  <div className="text-[12.5px] font-medium text-amber-600">{(u.cache_creation_input_tokens ?? 0).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-[11px] text-black/40">输出</div>
                  <div className="text-[12.5px] font-medium text-black/75">{(u.output_tokens ?? 0).toLocaleString()}</div>
                </div>
              </div>
            )}
          </div>

          {/* 本轮缓存段布局 */}
          {health.segments.length > 0 && (
            <div className="rounded-2xl border border-black/[0.08] bg-white/30 px-3 py-2.5">
              <div className="font-caption text-[11px] italic text-black/40">本轮缓存段（哈希稳定 = 可跨轮复用）</div>
              {health.segments.map((s, i) => (
                <div key={i} className="mt-1.5 font-mono text-[11px] leading-relaxed text-black/55">
                  <div>{s.path} <span className="text-black/35">· {s.kind}</span></div>
                  <div className="text-black/40">
                    {s.chars ? `${s.chars.toLocaleString()} 字 · ` : ""}hash {s.hash}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 最近事件流水 */}
          {events.length > 0 && (
            <div className="rounded-2xl border border-black/[0.08] bg-white/30 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <div className="font-caption text-[11px] italic text-black/40">最近记录（本地日志）</div>
                <button
                  onClick={() => {
                    clearCacheLog();
                    refresh();
                  }}
                  className="font-caption text-[11px] italic text-black/40 underline-offset-2 hover:text-black/60 hover:underline"
                >
                  清空
                </button>
              </div>
              <div className="mt-1.5 space-y-1">
                {events.map((e, i) =>
                  e.event === "usage" ? (
                    <div key={i} className="flex items-baseline gap-2 font-mono text-[11px] text-black/55">
                      <span className="shrink-0 text-black/35">{timeOf(e.ts)}</span>
                      <span className="truncate">
                        in {e.usage.input_tokens ?? 0} · 读 {(e.usage.cache_read_input_tokens ?? 0).toLocaleString()} · 建 {(e.usage.cache_creation_input_tokens ?? 0).toLocaleString()} · out {e.usage.output_tokens ?? 0}
                      </span>
                    </div>
                  ) : (
                    <div key={i} className="flex items-baseline gap-2 font-mono text-[11px] text-black/55">
                      <span className="shrink-0 text-black/35">{timeOf(e.ts)}</span>
                      <span className="truncate">
                        {e.skipped ? `缓存停用（${e.skipped === "media" ? "带图" : "工具回执轮"}）` : `缓存段 × ${e.segments.length}`}
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

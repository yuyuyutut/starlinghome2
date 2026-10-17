/**
 * latent/LatentPanel.tsx — 「记忆」Tab：显影记忆的分区管理面板
 * 未解决清单 / 记忆库（可搜索、置顶、变迁、撤回）/ 已变迁 / 已撤回
 * 视觉沿用灰调玻璃卡片 + 花体标题 + 折叠分区，与设置/应用面板一致。
 */
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "@/modules/settings/Section";
import type { Companion } from "@/hooks/useCompanion";
import { searchMemories, type SearchHit } from "./bm25";
import { correctRecord, restoreRecord, supersedeRecord } from "./ledger";
import {
  addRecords,
  addUnresolved,
  removeUnresolved,
  toggleUnresolved,
  updateRecord,
  useLatent,
} from "./store";
import type { MemoryRecord } from "./types";

const SOURCE_TAG: Record<string, string> = { auto: "自动", manual: "手动", llm: "总结" };

export function LatentPanel({ c }: { c: Companion }) {
  const { records, unresolved } = useLatent();
  const [query, setQuery] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftStatus, setDraftStatus] = useState("");
  const [unDraft, setUnDraft] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [superseding, setSuperseding] = useState<string | null>(null);
  const [supBody, setSupBody] = useState("");
  const [supStatus, setSupStatus] = useState("");
  const [summarizing, setSummarizing] = useState(false);

  const active = records.filter((r) => !r.corrected && !r.supersededBy);
  const changed = records.filter((r) => !r.corrected && !!r.supersededBy);
  const corrected = records.filter((r) => r.corrected);
  const open = unresolved.filter((u) => !u.done);
  const searching = query.trim().length > 0;
  const [hits, setHits] = useState<SearchHit[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    let alive = true;
    void searchMemories(records, q, { limit: 20 }).then((h) => {
      if (alive) setHits(h);
    });
    return () => {
      alive = false;
    };
  }, [query, records]);

  const titleOf = (body: string) => body.trim().slice(0, 12);
  const byUpdated = [...active].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

  const addDraft = async () => {
    if (!draftBody.trim()) return;
    const n = await addRecords(c.charId, [
      { title: titleOf(draftBody), body: draftBody, status: draftStatus.trim() || "当下仍有效", source: "manual" },
    ]);
    if (n.length > 0) c.toast("已记下", "info");
    setDraftBody("");
    setDraftStatus("");
  };

  const summarize = async () => {
    setSummarizing(true);
    try {
      await c.summarizeWithLLM();
    } finally {
      setSummarizing(false);
    }
  };

  const doSupersede = async (old: MemoryRecord) => {
    if (!supBody.trim()) return;
    await supersedeRecord(c.charId, old, {
      title: titleOf(supBody),
      body: supBody.trim(),
      status: supStatus.trim() || "当下仍有效",
      source: "manual",
    });
    c.toast("已登记变迁：旧说法保留在变迁链里", "info");
    setSuperseding(null);
    setSupBody("");
    setSupStatus("");
  };

  const row = (r: MemoryRecord, opts?: { dim?: boolean; extra?: ReactNode }) => (
    <div key={r.id} className="py-3.5">
      <button
        onClick={() => setExpanded(expanded === r.id ? null : r.id)}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="flex-1">
          <span className={`block text-[14px] font-light leading-relaxed ${opts?.dim ? "text-black/45 line-through decoration-black/20" : "text-[#2b2b2b]"}`}>
            {r.pinned && <span className="mr-1.5 text-black/40">✦</span>}
            {r.body}
          </span>
          <span className="font-caption mt-1 block text-[12px] text-black/35">
            — {SOURCE_TAG[r.source] ?? r.source} · 被想起 {r.hits} 次 · 当下：{r.status}
          </span>
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={`mt-1.5 shrink-0 text-black/30 transition-transform duration-300 ${expanded === r.id ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {expanded === r.id && (
        <div className="bubble-in mt-3 space-y-2">
          {!r.corrected && !r.supersededBy && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm" variant="secondary"
                  onClick={() => void updateRecord(r.id, { pinned: !r.pinned })}
                  className="h-8 rounded-full bg-black/[0.05] px-3 text-[12px] font-normal text-black/60 hover:bg-black/10"
                >
                  {r.pinned ? "取消置顶常驻" : "✦ 置顶常驻"}
                </Button>
                <Button
                  size="sm" variant="secondary"
                  onClick={() => { setSuperseding(superseding === r.id ? null : r.id); setSupBody(r.body); setSupStatus(""); }}
                  className="h-8 rounded-full bg-black/[0.05] px-3 text-[12px] font-normal text-black/60 hover:bg-black/10"
                >
                  事实变了…
                </Button>
                <Button
                  size="sm" variant="secondary"
                  onClick={() => { void correctRecord(r.id); c.toast("已撤回这条记忆（可在下方恢复）", "info"); }}
                  className="h-8 rounded-full bg-black/[0.05] px-3 text-[12px] font-normal text-black/60 hover:bg-black/10"
                >
                  记错了
                </Button>
                <Button
                  size="sm" variant="secondary"
                  onClick={() => void c.deleteMemory(r.id)}
                  className="h-8 rounded-full bg-black/[0.05] px-3 text-[12px] font-normal text-rose/70 hover:bg-black/10"
                >
                  删除
                </Button>
              </div>
              {superseding === r.id && (
                <div className="space-y-2 rounded-2xl bg-black/[0.04] p-3">
                  <Input
                    value={supBody} onChange={(e) => setSupBody(e.target.value)}
                    placeholder="新的说法（完整叙述）"
                    className="border-0 bg-white/60 text-[13px] font-light focus-visible:ring-0"
                  />
                  <Input
                    value={supStatus} onChange={(e) => setSupStatus(e.target.value)}
                    placeholder="当下状态（默认：当下仍有效）"
                    className="border-0 bg-white/60 text-[13px] font-light focus-visible:ring-0"
                  />
                  <Button
                    size="sm" onClick={() => void doSupersede(r)} disabled={!supBody.trim()}
                    className="h-8 rounded-full bg-[#2b2b2b] px-4 text-[12px] font-normal text-white hover:bg-black"
                  >
                    登记变迁 · 旧说法进入变迁链
                  </Button>
                </div>
              )}
            </>
          )}
          {r.supersededBy && (
            <p className="font-caption rounded-2xl bg-black/[0.04] px-3 py-2 text-[12.5px] text-black/50">
              — 此事已有新说法，查「以前/曾经」时才会连同旧值一起浮现
            </p>
          )}
          {r.corrected && (
            <Button
              size="sm" variant="secondary"
              onClick={() => { void restoreRecord(r.id); c.toast("已恢复这条记忆", "info"); }}
              className="h-8 rounded-full bg-black/[0.05] px-3 text-[12px] font-normal text-black/60 hover:bg-black/10"
            >
              恢复这条记忆
            </Button>
          )}
          {opts?.extra}
        </div>
      )}
    </div>
  );

  return (
    <div className="chat-scroll h-full overflow-y-auto px-5 py-6">
      <div className="mx-auto max-w-lg space-y-5">
        {/* 头部 */}
        <div className="glass-deep rounded-[28px] p-5">
          <div className="font-script text-[22px] leading-none text-[#1f1f1f]">Mémoire · 显影</div>
          <div className="font-caption mt-1 text-[13px] text-black/45">
            记忆库 {active.length} 件 · 未了 {open.length} 件 · 被想起共 {records.reduce((s, r) => s + r.hits, 0)} 次
          </div>
          <p className="font-caption mt-3 rounded-2xl bg-black/[0.04] px-3 py-2 text-[12.5px] leading-relaxed text-black/50">
            — 记忆不再全部塞给模型：聊到相关的旧事才会被检索浮现（用进废退）；✦ 置顶的常驻每轮都在
          </p>
        </div>

        {/* 搜索 */}
        <div className="glass-deep flex items-center gap-2 rounded-full px-4 py-2.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-black/35">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <Input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="在记忆里检索…（同义说法也能试试）"
            className="border-0 bg-transparent text-[14px] font-light focus-visible:ring-0"
          />
        </div>

        {searching ? (
          <div className="glass-deep divide-y divide-black/[0.08] rounded-[28px] px-5">
            {hits.length === 0 ? (
              <div className="font-caption py-8 text-center text-[13px] text-black/40">— 没有找到相关的旧事</div>
            ) : (
              hits.map((h) => row(h.record))
            )}
          </div>
        ) : (
          <>
            {/* 未解决清单 */}
            <Section zh={`仍未了的事 · ${open.length} 件（换窗时优先带回）`} fr="En suspens" defaultOpen={open.length > 0}>
              <div className="glass flex items-center gap-2 rounded-full p-1 pl-3">
                <Input
                  value={unDraft} onChange={(e) => setUnDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) { void addUnresolved(c.charId, unDraft); setUnDraft(""); } }}
                  placeholder="记下一件还没了结的事…"
                  className="border-0 bg-transparent text-[13.5px] font-light focus-visible:ring-0"
                />
                <Button
                  onClick={() => { void addUnresolved(c.charId, unDraft); setUnDraft(""); }}
                  disabled={!unDraft.trim()} size="sm"
                  className="h-8 shrink-0 rounded-full bg-[#2b2b2b] px-3.5 text-[12px] font-normal text-white hover:bg-black"
                >
                  记下
                </Button>
              </div>
              {unresolved.length > 0 && (
                <div className="mt-3 divide-y divide-black/[0.07] rounded-2xl border border-black/[0.09] bg-white/30">
                  {unresolved.map((u) => (
                    <div key={u.id} className="flex items-center gap-2.5 px-3 py-2.5">
                      <button
                        onClick={() => void toggleUnresolved(u.id)}
                        aria-label={u.done ? "标为未了" : "标为了结"}
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px] transition-colors ${
                          u.done ? "border-black/30 bg-black/10 text-black/50" : "border-black/25 text-transparent hover:border-black/40"
                        }`}
                      >
                        ✓
                      </button>
                      <span className={`flex-1 text-[13.5px] font-light ${u.done ? "text-black/35 line-through" : "text-[#2b2b2b]"}`}>
                        {u.text}
                      </span>
                      <button onClick={() => void removeUnresolved(u.id)} className="shrink-0 text-[11px] text-black/25 transition-colors hover:text-rose">
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* 手动记下 + AI 整理 */}
            <div className="glass-deep space-y-2 rounded-[28px] p-4">
              <Input
                value={draftBody} onChange={(e) => setDraftBody(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && void addDraft()}
                placeholder="记下一件事…（回车保存）"
                className="border-0 bg-white/50 text-[14px] font-light focus-visible:ring-0"
              />
              <Input
                value={draftStatus} onChange={(e) => setDraftStatus(e.target.value)}
                placeholder="当下状态（病灶迁移：每条记忆都要以现状收尾）"
                className="border-0 bg-white/50 text-[13px] font-light focus-visible:ring-0"
              />
              <Button onClick={() => void addDraft()} disabled={!draftBody.trim()} size="sm"
                className="h-8 rounded-full bg-[#2b2b2b] px-4 text-[12px] font-normal text-white hover:bg-black">
                记下
              </Button>
              <Button onClick={() => void summarize()} disabled={summarizing} variant="secondary"
                className="glass ml-2 h-8 rounded-full px-4 text-[12px] font-normal text-black/70 hover:bg-white/70">
                {summarizing ? "整理中…" : "让 AI 整理最近的对话"}
              </Button>
            </div>

            {/* 记忆库 */}
            <Section zh={`记忆库 · ${active.length} 件（相关时才浮现，✦ 为常驻）`} fr="Souvenirs" defaultOpen>
              {active.length === 0 ? (
                <p className="font-caption rounded-2xl bg-black/[0.04] px-3 py-4 text-center text-[12.5px] text-black/45">
                  vide… 聊天时说出「我喜欢…」「记住…」会自动记到这里
                </p>
              ) : (
                <div className="divide-y divide-black/[0.08]">{byUpdated.map((r) => row(r))}</div>
              )}
            </Section>

            {/* 已变迁 */}
            {changed.length > 0 && (
              <Section zh={`已变迁 · ${changed.length} 件（事实变了，旧说法留档）`} fr="Changements">
                <div className="divide-y divide-black/[0.08]">{changed.map((r) => row(r, { dim: true }))}</div>
              </Section>
            )}

            {/* 已撤回 */}
            {corrected.length > 0 && (
              <Section zh={`已撤回 · ${corrected.length} 件（记错的，不再浮现）`} fr="Retraits">
                <div className="divide-y divide-black/[0.08]">{corrected.map((r) => row(r, { dim: true }))}</div>
              </Section>
            )}
          </>
        )}

        <p className="font-caption pb-4 text-center text-[13px] text-black/40">elle s'en souviendra toujours</p>
      </div>
    </div>
  );
}

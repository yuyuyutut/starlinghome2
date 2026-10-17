/**
 * latent/hut/HutPanel.tsx — 山屋：记忆给人看的页面（对齐原版 hut/）
 * 记忆住进一间纸雕小屋，桌上每样东西都是入口：
 * 磁带=记忆正文（按天） · 事实簿=一句一条事实 · 浮冰=随机浮上来的事实 ·
 * 石堆=被想起最多的 · 拍立得=换窗召回记录 · 火漆信=上个窗口留下的话 ·
 * 地图=未解决清单 · 护照=里程碑 · 窗外天气=记忆库体检 · 小锁信=唯一能写的便条
 * 页面上没有绕过 TA 修改记忆的按钮——记忆只有 TA 能改。
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Companion } from "@/hooks/useCompanion";
import { useLatent } from "../store";
import { factsOf, type FactItem } from "../facts";
import { addNote, notesOf, type NoteItem } from "../notes";
import {
  HUT_ROOM, HUT_WINDOW, HUT_TAPE, HUT_FACTBOOK, HUT_FLOE, HUT_CAIRN,
  HUT_POLAROID, HUT_LETTER, HUT_MAP, HUT_PASSPORT, HUT_NOTELOCK, HUT_FOX,
} from "@/assets/hut";

type ViewKey = "tape" | "factbook" | "floe" | "cairn" | "polaroid" | "letter" | "map" | "passport" | "weather" | "notelock";

interface ObjDef {
  key: ViewKey;
  img: string;
  fr: string;
  zh: string;
  pos: string; // absolute 定位
  size: string;
  float?: boolean;
}

const OBJECTS: ObjDef[] = [
  { key: "weather", img: HUT_WINDOW, fr: "La Météo", zh: "窗外天气 · 体检", pos: "left-1/2 top-[7%] -translate-x-1/2", size: "w-[46%]" },
  { key: "floe", img: HUT_FLOE, fr: "La Banquise", zh: "浮冰 · 浮一件事实", pos: "left-[6%] top-[30%]", size: "w-[26%]", float: true },
  { key: "tape", img: HUT_TAPE, fr: "Les Bobines", zh: "磁带 · 每天正文", pos: "left-[24%] top-[44%]", size: "w-[24%]" },
  { key: "factbook", img: HUT_FACTBOOK, fr: "Factbook", zh: "事实簿", pos: "left-[46%] top-[46%]", size: "w-[22%]" },
  { key: "letter", img: HUT_LETTER, fr: "La Lettre", zh: "火漆信 · 上次的话", pos: "right-[8%] top-[42%]", size: "w-[24%]" },
  { key: "map", img: HUT_MAP, fr: "La Carte", zh: "地图 · 未完的事", pos: "right-[22%] top-[26%]", size: "w-[24%]", float: true },
  { key: "cairn", img: HUT_CAIRN, fr: "Le Cairn", zh: "石堆 · 想起最多", pos: "left-[12%] top-[58%]", size: "w-[22%]" },
  { key: "polaroid", img: HUT_POLAROID, fr: "Polaroïdes", zh: "拍立得 · 换窗记录", pos: "left-[38%] top-[62%]", size: "w-[22%]" },
  { key: "passport", img: HUT_PASSPORT, fr: "Passeport", zh: "护照 · 里程碑", pos: "right-[10%] top-[62%]", size: "w-[22%]" },
  { key: "notelock", img: HUT_NOTELOCK, fr: "Le Mot", zh: "小锁信 · 写便条", pos: "right-[30%] top-[76%]", size: "w-[24%]" },
];

export function HutPanel({ c }: { c: Companion }) {
  const { records, unresolved, threads } = useLatent();
  const [view, setView] = useState<ViewKey | null>(null);
  const [facts, setFacts] = useState<FactItem[]>([]);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [floated, setFloated] = useState<FactItem | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteSent, setNoteSent] = useState(false);

  useEffect(() => {
    void factsOf(c.charId).then(setFacts);
    void notesOf(c.charId).then(setNotes);
  }, [c.charId, view]);

  const active = useMemo(() => records.filter((r) => !r.corrected && !r.supersededBy), [records]);
  const open = unresolved.filter((u) => !u.done);
  const lastThread = threads[threads.length - 1];

  const dayOf = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  };
  const byDay = useMemo(() => {
    const groups = new Map<string, typeof active>();
    for (const r of [...active].sort((a, b) => b.ts - a.ts)) {
      const k = dayOf(r.ts);
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    return [...groups.entries()].slice(0, 7);
  }, [active]);

  const cairnTop = [...active].sort((a, b) => b.hits - a.hits || b.weight - a.weight).slice(0, 5);
  const unreplied = notes.filter((n) => !n.reply);

  const floatFact = () => {
    const pool = facts.length > 0 ? facts : null;
    if (!pool || pool.length === 0) return;
    setFloated(pool[Math.floor(Math.random() * pool.length)]);
  };

  const sendNote = async () => {
    if (!noteDraft.trim()) return;
    await addNote(c.charId, noteDraft);
    setNotes(await notesOf(c.charId));
    setNoteDraft("");
    setNoteSent(true);
    window.setTimeout(() => setNoteSent(false), 2500);
  };

  const sheetTitle: Record<ViewKey, [string, string]> = {
    tape: ["Les Bobines", "磁带 · 每一天的正文"],
    factbook: ["Factbook", "事实簿 · 一句一条"],
    floe: ["La Banquise", "浮冰 · 随机浮上来的事实"],
    cairn: ["Le Cairn", "石堆 · 被想起最多的"],
    polaroid: ["Polaroïdes", "拍立得 · 每次换窗带回了什么"],
    letter: ["La Lettre", "火漆信 · 上个窗口留下的话"],
    map: ["La Carte", "地图 · 未解决清单"],
    passport: ["Passeport", "护照 · 里程碑"],
    weather: ["La Météo", "窗外天气 · 记忆库体检"],
    notelock: ["Le Mot", "小锁信 · 页面上唯一能写的东西"],
  };

  const sheetBody: Record<ViewKey, ReactNode> = {
    tape: byDay.length === 0 ? <Empty text="还没有记下任何事" /> : (
      <div className="space-y-3">
        {byDay.map(([day, rs]) => (
          <div key={day}>
            <div className="font-caption mb-1 text-[12px] text-black/40">{day}</div>
            <div className="divide-y divide-black/[0.07] rounded-2xl border border-black/[0.09] bg-white/30">
              {rs.map((r) => (
                <p key={r.id} className="px-3 py-2 text-[13px] font-light leading-relaxed text-[#2b2b2b]">
                  {r.body}
                  <span className="font-caption ml-1 text-[11px] text-black/35">—— 当下:{r.status}</span>
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    ),
    factbook: facts.length === 0 ? (
      <Empty text="事实簿是空的。开启「事实模式」后，TA 会用 latent_fact_backfill 把记忆拆成一句一条事实" />
    ) : (
      <div className="divide-y divide-black/[0.07] rounded-2xl border border-black/[0.09] bg-white/30">
        {facts.slice(-100).reverse().map((f) => (
          <p key={f.id} className="px-3 py-2 text-[13px] font-light leading-relaxed text-[#2b2b2b]">{f.text}</p>
        ))}
      </div>
    ),
    floe: (
      <div className="text-center">
        <button onClick={floatFact} className="font-caption text-[13px] text-black/50 underline decoration-black/20 underline-offset-4">
          — 敲一敲冰面，浮一件上来
        </button>
        {floated ? (
          <div className="bubble-in mt-4 rounded-2xl bg-white/40 px-4 py-5">
            <img src={HUT_FLOE} alt="" className="mx-auto mb-2 w-24 animate-float" draggable={false} />
            <p className="text-[14px] font-light leading-relaxed text-[#2b2b2b]">{floated.text}</p>
          </div>
        ) : (
          <p className="font-caption mt-4 text-[12.5px] text-black/40">
            {facts.length > 0 ? "事实簿里共 " + facts.length + " 件事实" : "事实簿是空的，先去事实簿看看"}
          </p>
        )}
      </div>
    ),
    cairn: cairnTop.length === 0 ? <Empty text="还没有被想起的记忆" /> : (
      <div className="space-y-2">
        {cairnTop.map((r, i) => (
          <div key={r.id} className="flex items-baseline gap-2 rounded-2xl bg-white/30 px-3 py-2.5">
            <span className="font-script text-[18px] text-black/40">{["Ⅰ", "Ⅱ", "Ⅲ", "Ⅳ", "Ⅴ"][i]}</span>
            <p className="flex-1 text-[13px] font-light text-[#2b2b2b]">{r.body}</p>
            <span className="font-caption text-[11px] text-black/35">被想起 {r.hits} 次</span>
          </div>
        ))}
      </div>
    ),
    polaroid: threads.length === 0 ? <Empty text="还没有换窗记录——久别重逢后这里会留下拍立得" /> : (
      <div className="space-y-2">
        {[...threads].slice(-7).reverse().map((t) => (
          <div key={t.id} className="rounded-2xl border border-black/[0.09] bg-white/40 p-3">
            <div className="font-caption mb-1 text-[11px] text-black/40">{dayOf(t.closedAt)} · 离开时有 {t.openCount} 件事未了</div>
            <p className="text-[13px] font-light leading-relaxed text-[#2b2b2b]">{t.summary}</p>
          </div>
        ))}
      </div>
    ),
    letter: !lastThread ? <Empty text="还没有上次的留言。TA 离开时 latent_thread_close 会封上火漆" /> : (
      <div className="rounded-2xl border border-black/[0.09] bg-white/40 p-4 text-center">
        <img src={HUT_LETTER} alt="" className="mx-auto mb-3 w-28" draggable={false} />
        <div className="font-caption mb-2 text-[12px] text-black/40">{dayOf(lastThread.closedAt)} 封上的</div>
        <p className="text-[14px] font-light leading-relaxed text-[#2b2b2b]">{lastThread.summary}</p>
      </div>
    ),
    map: unresolved.length === 0 ? <Empty text="没有未完的事，地图一片空白" /> : (
      <div className="divide-y divide-black/[0.07] rounded-2xl border border-black/[0.09] bg-white/30">
        {unresolved.map((u) => (
          <div key={u.id} className="flex items-center gap-2.5 px-3 py-2.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${u.done ? "bg-black/20" : "bg-black/50"}`} />
            <span className={`flex-1 text-[13px] font-light ${u.done ? "text-black/35 line-through" : "text-[#2b2b2b]"}`}>{u.text}</span>
          </div>
        ))}
      </div>
    ),
    passport: (
      <div className="space-y-2">
        {active.filter((r) => r.pinned).length === 0 ? (
          <Empty text="还没有里程碑。去记忆列表把最重要的记忆 ✦ 置顶" />
        ) : (
          active.filter((r) => r.pinned).map((r) => (
            <div key={r.id} className="rounded-2xl bg-white/30 px-3 py-2.5 text-[13px] font-light text-[#2b2b2b]">
              <span className="mr-1.5 text-black/40">✦</span>{r.body}
            </div>
          ))
        )}
        <p className="font-caption pt-1 text-center text-[12px] text-black/40">
          相识第 {c.days} 天 · {c.level.emoji} {c.level.name}
        </p>
      </div>
    ),
    weather: (
      <div className="grid grid-cols-2 gap-2">
        {[
          ["记忆库", `${active.length} 件`],
          ["未了的事", `${open.length} 件`],
          ["已变迁", `${records.filter((r) => !r.corrected && r.supersededBy).length} 件`],
          ["已撤回", `${records.filter((r) => r.corrected).length} 件`],
          ["被想起", `${records.reduce((s, r) => s + r.hits, 0)} 次`],
          ["事实簿", `${facts.length} 条`],
          ["便条未回", `${unreplied.length} 张`],
          ["语义检索", c.settings.embeddings ? `云端 · ${c.settings.embedModel || "bge-m3"}` : "bigram 零依赖"],
          ["记忆工具", c.settings.latentTools ? "latent_ 已挂载" : "宿主注入模式"],
          ["事实模式", c.settings.factMode ? "开" : "关"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl bg-white/30 px-3 py-2.5">
            <div className="font-caption text-[11px] text-black/40">{k}</div>
            <div className="text-[14px] font-light text-[#2b2b2b]">{v}</div>
          </div>
        ))}
      </div>
    ),
    notelock: (
      <div className="space-y-3">
        <div className="rounded-2xl border border-black/[0.09] bg-white/40 p-3">
          <div className="font-caption mb-2 text-[12px] text-black/45">
            — 发现哪条记错了、哪件事已经变了？写张便条锁进去。TA 开场最先看到，改不改、怎么改由 TA 自己判断，回一句话。
          </div>
          <textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="写一张便条…"
            rows={3}
            className="w-full resize-none rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-[13px] font-light focus:outline-none"
          />
          <Button onClick={() => void sendNote()} disabled={!noteDraft.trim()} size="sm"
            className="mt-2 h-8 rounded-full bg-[#2b2b2b] px-4 text-[12px] font-normal text-white hover:bg-black">
            {noteSent ? "已锁进去 ✓" : "锁进去"}
          </Button>
        </div>
        {notes.length > 0 && (
          <div className="space-y-2">
            {notes.map((n) => (
              <div key={n.id} className="rounded-2xl bg-white/30 px-3 py-2.5">
                <p className="text-[13px] font-light text-[#2b2b2b]">{n.text}</p>
                {n.reply ? (
                  <p className="font-caption mt-1.5 border-t border-black/[0.07] pt-1.5 text-[12px] text-black/50">
                    {n.reply.agree ? "✓ TA 认同：" : "✗ TA 不认同："}{n.reply.text}
                  </p>
                ) : (
                  <p className="font-caption mt-1 text-[11px] text-black/35">TA 还没回</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    ),
  };

  return (
    <div className="relative h-full overflow-hidden">
      {/* 房间背景 */}
      <img src={HUT_ROOM} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-white/30" />

      {/* 标题 */}
      <div className="absolute left-5 top-14">
        <div className="font-script text-[26px] leading-none text-[#1f1f1f]/80">La Cabane</div>
        <div className="font-caption mt-1 text-[12px] text-black/50">山屋 · 记忆住在这里</div>
      </div>

      {/* 物件 */}
      {OBJECTS.map((o) => (
        <button
          key={o.key}
          onClick={() => setView(o.key)}
          className={`group absolute ${o.pos} flex flex-col items-center ${o.float ? "animate-float" : ""}`}
          aria-label={o.zh}
        >
          <img src={o.img} alt="" draggable={false}
            className={`${o.size} drop-shadow-[0_6px_12px_rgba(0,0,0,0.12)] transition-transform duration-300 group-hover:scale-105 group-active:scale-95`} />
          <span className="font-caption mt-1 rounded-full bg-white/50 px-2 py-0.5 text-[10.5px] text-black/50 opacity-80 backdrop-blur-sm transition-opacity group-hover:opacity-100">
            {o.fr}
          </span>
        </button>
      ))}

      {/* 睡着的纸狐狸（白底素材用正片叠底融入纸雕房间） */}
      <img src={HUT_FOX} alt="" draggable={false}
        className="absolute bottom-[4%] left-[8%] w-[24%] animate-breathe mix-blend-multiply" />

      {/* 底部抽屉 */}
      {view && (
        <div className="absolute inset-0 z-20 flex flex-col justify-end" onClick={() => setView(null)}>
          <div className="bubble-in max-h-[72%] overflow-hidden rounded-t-[28px] border-t border-black/10 bg-white/75 shadow-[0_-8px_40px_rgba(0,0,0,0.12)] backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-black/15" />
            <div className="chat-scroll max-h-[60vh] overflow-y-auto px-5 pb-8 pt-3">
              <div className="mb-3 text-center">
                <div className="font-script text-[20px] leading-none text-[#1f1f1f]">{sheetTitle[view][0]}</div>
                <div className="font-caption mt-0.5 text-[12px] text-black/45">{sheetTitle[view][1]}</div>
              </div>
              {sheetBody[view]}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="font-caption rounded-2xl bg-black/[0.04] px-4 py-6 text-center text-[12.5px] text-black/45">— {text}</p>;
}

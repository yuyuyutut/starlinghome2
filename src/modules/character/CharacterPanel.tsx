/**
 * character/CharacterPanel.tsx — 角色卡编辑（灰调玻璃风格）
 */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Companion } from "@/hooks/useCompanion";
import { Avatar } from "./Avatar";
import { AVATAR_CHOICES, type CharacterCard } from "./types";

export function CharacterPanel({ c }: { c: Companion }) {
  const [form, setForm] = useState<CharacterCard>(c.card);
  const [saved, setSaved] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    setForm(c.card);
    setConfirmDel(false);
  }, [c.card]);

  const set = <K extends keyof CharacterCard>(key: K, value: CharacterCard[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () => {
    void c.saveCard({ ...form, name: form.name.trim() || "星野" });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  /** 统一的区块标题 */
  const sectionTitle = (zh: string, fr: string) => (
    <div className="mb-3">
      <div className="font-script text-[22px] leading-none text-[#1f1f1f]">{fr}</div>
      <div className="font-caption mt-1 text-[13px] text-black/45">{zh}</div>
    </div>
  );

  return (
    <div className="chat-scroll h-full overflow-y-auto px-5 py-6">
      <div className="mx-auto max-w-lg space-y-5">
        {/* 聊天对象切换：每个对象有独立的聊天记录和记忆 */}
        <div className="glass-deep rounded-[28px] p-5">
          {sectionTitle("切换聊天对象", "Compagnons")}
          <div className="flex flex-wrap gap-2">
            {c.characters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => void c.switchCharacter(ch.id)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition-colors ${
                  ch.id === c.charId ? "bg-[#2b2b2b] text-white" : "glass text-black/60 hover:bg-white/70"
                }`}
              >
                <span className="emoji-mono">{ch.avatar}</span>
                {ch.name}
              </button>
            ))}
            <button
              onClick={() => void c.createCharacter()}
              className="rounded-full border border-dashed border-black/25 px-3.5 py-1.5 text-[13px] text-black/50 transition-colors hover:bg-white/40"
            >
              ＋ 新伙伴
            </button>
          </div>
          <p className="font-caption mt-2.5 text-[12px] text-black/40">— 每个伙伴都有独立的聊天记录和记忆</p>
        </div>

        <div className="glass-deep rounded-[28px] p-5">
          {sectionTitle("名字与头像", "Personnage")}
          <div className="flex items-center gap-4">
            <Avatar card={form} className="h-16 w-16 border border-white/70" />
            <div className="flex-1 space-y-1">
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="underline-input h-9 text-lg font-light text-[#1f1f1f] focus-visible:ring-0"
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => set("avatarImg", "builtin:fox")}
                  className={`rounded-full px-3 py-1 text-[11px] transition-colors ${
                    form.avatarImg ? "bg-[#2b2b2b] text-white" : "glass text-black/60"
                  }`}
                >
                  插画头像
                </button>
                <button
                  onClick={() => set("avatarImg", undefined)}
                  className={`rounded-full px-3 py-1 text-[11px] transition-colors ${
                    !form.avatarImg ? "bg-[#2b2b2b] text-white" : "glass text-black/60"
                  }`}
                >
                  Emoji 头像
                </button>
              </div>
            </div>
          </div>
          {!form.avatarImg && (
            <div className="mt-4">
              <div className="font-caption mb-2 text-[13px] text-black/45">— choisir un émoji</div>
              <div className="flex flex-wrap gap-2">
                {AVATAR_CHOICES.map((a) => (
                  <button
                    key={a}
                    onClick={() => set("avatar", a)}
                    className={`grid h-10 w-10 place-items-center rounded-xl text-xl transition-all ${
                      form.avatar === a ? "glass-deep ring-1 ring-black/30" : "glass hover:bg-white/60"
                    }`}
                  >
                    <span className="emoji-mono">{a}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 文字设定 */}
        <div className="glass-deep space-y-5 rounded-[28px] p-5">
          {sectionTitle("灵魂设定", "L'âme")}
          {[
            { k: "personality" as const, label: "性格", fr: "caractère", rows: 2 },
            { k: "speakingStyle" as const, label: "说话风格", fr: "style de parole", rows: 2 },
            { k: "background" as const, label: "背景故事（可选）", fr: "histoire", rows: 3 },
          ].map((f) => (
            <div key={f.k} className="space-y-1">
              <Label className="text-[13px] font-normal text-black/70">
                {f.label} <span className="font-caption ml-1 text-black/40">{f.fr}</span>
              </Label>
              <Textarea
                value={form[f.k]}
                onChange={(e) => set(f.k, e.target.value)}
                rows={f.rows}
                className="underline-input resize-none rounded-none text-[15px] font-light focus-visible:ring-0"
              />
            </div>
          ))}
          {[
            { k: "relationship" as const, label: "你们的关系", fr: "relation" },
            { k: "firstMessage" as const, label: "开场白", fr: "premier mot" },
          ].map((f) => (
            <div key={f.k} className="space-y-1">
              <Label className="text-[13px] font-normal text-black/70">
                {f.label} <span className="font-caption ml-1 text-black/40">{f.fr}</span>
              </Label>
              <Input
                value={form[f.k]}
                onChange={(e) => set(f.k, e.target.value)}
                className="underline-input h-9 text-[15px] font-light focus-visible:ring-0"
              />
            </div>
          ))}
        </div>

        <Button onClick={save} className="h-12 w-full rounded-full bg-[#2b2b2b] text-[15px] font-normal tracking-widest text-white hover:bg-black">
          {saved ? "已保存 ✓" : "保存角色卡"}
        </Button>
        <p className="font-caption text-center text-[13px] text-black/40">ces réglages deviennent son âme</p>

        {/* 危险区：删除角色卡（两步确认） */}
        <div className="glass-deep rounded-[28px] p-5">
          {sectionTitle("危险区", "Zone de danger")}
          {confirmDel ? (
            <div className="space-y-3">
              <p className="text-[13px] font-normal leading-relaxed text-black/60">
                确认删除「{form.name}」？TA 的聊天记录、记忆、未了清单和便条会一起删除，不可恢复。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDel(false)}
                  className="glass h-10 flex-1 rounded-full text-[13px] font-normal text-black/60 transition-colors hover:bg-white/70"
                >
                  再想想
                </button>
                <button
                  onClick={() => {
                    setConfirmDel(false);
                    void c.deleteCharacter(form.id);
                  }}
                  className="h-10 flex-1 rounded-full bg-rose/90 text-[13px] font-normal text-white transition-colors hover:bg-rose"
                >
                  确认删除
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDel(true)}
              className="w-full rounded-full border border-rose/30 py-2.5 text-[13px] font-normal text-rose/80 transition-colors hover:bg-rose/5"
            >
              删除这个角色
            </button>
          )}
        </div>
        <p className="font-caption pb-4 text-center text-[13px] text-black/40">la dernière porte de sortie</p>
      </div>
    </div>
  );
}

/**
 * thought/bubbles.tsx — 双方内心旁白的展示组件（灰调玻璃风格）
 * · 机的旁白：❀ 花纹小注，显示在回复气泡上方；关闭显示只是隐藏，数据仍在
 * · 人类附言：细线小注显示在用户气泡下方，未读可改、已读锁定
 */
import { useState } from "react";
import { THOUGHT_MAX } from "./mark";

/** 机的内心旁白（TA 的真实想法，可能很短：一个字、一个标点） */
export function AssistantThought({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="mb-1.5 flex items-start gap-1.5 pl-1">
      <span className="mt-[3px] text-[11px] leading-none text-black/30">❀</span>
      <span className="font-caption text-[12.5px] italic leading-relaxed text-black/45">{text}</span>
    </div>
  );
}

/** 人类的私密附言：未读（可编辑）/ 已读（锁定） */
export function UserThought({
  thought,
  seenAt,
  onEdit,
}: {
  thought: string;
  seenAt?: number;
  onEdit?: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(thought);
  const seen = Boolean(seenAt);

  return (
    <div className="mt-1.5 text-right">
      {editing && onEdit ? (
        <div className="bubble-in ml-auto max-w-full rounded-2xl bg-black/[0.04] p-2 ring-1 ring-black/10">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={THOUGHT_MAX}
            autoFocus
            className="font-caption w-full resize-none rounded-xl bg-white/50 px-3 py-2 text-left text-[13px] leading-relaxed text-[#262626] focus:outline-none"
            placeholder="没说出口的话…"
          />
          <div className="mt-1.5 flex items-center justify-end gap-2 text-[12px]">
            <button
              onClick={() => {
                setEditing(false);
                setDraft(thought);
              }}
              className="rounded-full px-3 py-1 text-black/50 transition-colors hover:bg-black/[0.06]"
            >
              取消
            </button>
            <button
              onClick={() => {
                setEditing(false);
                onEdit(draft.trim());
              }}
              className="rounded-full bg-[#2b2b2b] px-3 py-1 text-white transition-colors hover:bg-black"
            >
              改好了
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            if (!seen && onEdit) {
              setDraft(thought);
              setEditing(true);
            }
          }}
          disabled={seen || !onEdit}
          title={seen ? "TA 已经读过了，不能再改" : "点按编辑附言（TA 读过之后就锁了）"}
          className={`font-caption max-w-full rounded-2xl border border-black/[0.08] bg-white/30 px-3 py-1.5 text-left text-[12.5px] italic leading-relaxed text-black/50 ${
            seen || !onEdit ? "cursor-default" : "cursor-text transition-colors hover:bg-white/50"
          }`}
        >
          {thought}
        </button>
      )}
      <div className="font-caption mt-1 flex items-center justify-end gap-1.5 pr-1 text-[11px] text-black/35">
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${seen ? "bg-emerald-700/50" : "bg-rose/50"}`} />
        {seen ? "已被 TA 读过 · 已锁定" : "还没被 TA 读到 · 可修改"}
      </div>
    </div>
  );
}

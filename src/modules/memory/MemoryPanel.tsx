/**
 * memory/MemoryPanel.tsx — 记忆管理（灰调玻璃风格）
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Companion } from "@/hooks/useCompanion";

const SOURCE_TAG: Record<string, string> = {
  auto: "自动",
  manual: "手动",
  llm: "总结",
};

export function MemoryPanel({ c }: { c: Companion }) {
  const [draft, setDraft] = useState("");
  const [summarizing, setSummarizing] = useState(false);

  const add = () => {
    if (!draft.trim()) return;
    void c.addMemory(draft);
    setDraft("");
  };

  const summarize = async () => {
    setSummarizing(true);
    try {
      await c.summarizeWithLLM();
    } finally {
      setSummarizing(false);
    }
  };

  return (
    <div className="chat-scroll h-full overflow-y-auto px-5 py-6">
      <div className="mx-auto max-w-lg space-y-5">
        <div className="glass-deep rounded-[28px] p-5">
          <div className="font-script text-[22px] leading-none text-[#1f1f1f]">Mémoire</div>
          <div className="font-caption mt-1 text-[13px] text-black/45">
            已记住 {c.memories.length} 件关于你的事
          </div>
        </div>

        {/* 手动添加 */}
        <div className="glass-deep flex items-center gap-2 rounded-full p-1.5 pl-4">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && add()}
            placeholder="记下一件事…"
            className="border-0 bg-transparent text-[15px] font-light focus-visible:ring-0"
          />
          <Button
            onClick={add}
            disabled={!draft.trim()}
            className="h-9 shrink-0 rounded-full bg-[#2b2b2b] px-4 text-[13px] font-normal text-white hover:bg-black"
          >
            记下
          </Button>
        </div>

        <Button
          onClick={summarize}
          disabled={summarizing}
          variant="secondary"
          className="glass h-11 w-full rounded-full text-[14px] font-normal text-black/70 hover:bg-white/70"
        >
          {summarizing ? "整理中…" : "让 AI 总结最近的对话（需要 API Key）"}
        </Button>

        {/* 列表 */}
        {c.memories.length === 0 ? (
          <div className="glass rounded-[28px] px-6 py-12 text-center">
            <div className="font-caption text-[15px] text-black/45">vide…</div>
            <p className="mt-2 text-[13px] text-black/40">
              聊天时说出「我喜欢…」「记住…」会自动记到这里
            </p>
          </div>
        ) : (
          <div className="glass-deep divide-y divide-black/[0.08] rounded-[28px] px-5">
            {[...c.memories].reverse().map((m) => (
              <div key={m.id} className="bubble-in flex items-center gap-3 py-3.5">
                <span className="font-caption shrink-0 text-[12px] text-black/35">— {SOURCE_TAG[m.source] ?? m.source}</span>
                <span className="flex-1 text-[14px] font-light leading-relaxed text-[#2b2b2b]">{m.content}</span>
                <button
                  onClick={() => void c.deleteMemory(m.id)}
                  className="shrink-0 text-[12px] text-black/30 transition-colors hover:text-rose"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="font-caption pb-4 text-center text-[13px] text-black/40">elle s'en souviendra toujours</p>
      </div>
    </div>
  );
}

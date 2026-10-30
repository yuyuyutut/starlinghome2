/**
 * chat/ChatPage.tsx — 聊天主界面（灰调玻璃风格）
 * 头像 + 心情状态 / 纪念日横幅 / 磨砂气泡 / 打字动画 / 进度发丝条
 */
import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { requestCallStart } from "@/modules/call/useCall";
import type { Companion } from "@/hooks/useCompanion";
import { Avatar } from "@/modules/character/Avatar";
import { anniversaryText, AFFECTION_LEVELS } from "@/modules/affection/affection";
import { fileToDataUri } from "./image";
import { PillChip } from "@/modules/pills/PillChip";
import { AssistantThought, UserThought } from "@/modules/thought/bubbles";

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-1" aria-label="正在输入">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full bg-black/50 animate-typing-dot"
          style={{ animationDelay: `${i * 0.18}s` }}
        />
      ))}
    </div>
  );
}

/** 思维链：折叠时 thinking 被花瓣纹包裹；展开后内容入框、发丝线小花收尾 */
function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="group mb-1.5 flex items-center gap-2 pl-1"
        aria-label="展开思考过程"
      >
        <span className="text-[11px] leading-none text-black/30 transition-all group-hover:rotate-45 group-hover:text-black/55">
          ❀
        </span>
        <span className="font-caption text-[12.5px] tracking-wide text-black/40 transition-colors group-hover:text-black/65">
          thinking
        </span>
        <span className="font-caption text-[12.5px] text-black/30 transition-colors group-hover:text-black/55">❀</span>
        <span className="text-[11px] leading-none text-black/30 transition-all group-hover:-rotate-45 group-hover:text-black/55">
          ❀
        </span>
      </button>
    );
  }

  return (
    <div className="bubble-in mb-2 max-w-full">
      {/* 标签：thinking + 花纹 */}
      <div className="flex items-center gap-1.5 pl-1">
        <span className="font-caption text-[12.5px] text-black/50">thinking</span>
        <span className="text-[11px] leading-none text-black/35">❀</span>
      </div>
      {/* 方框内容（手稿：括号框住的思考内容；点击可收起） */}
      <button
        onClick={() => setOpen(false)}
        title="点击收起"
        className="font-caption mt-1.5 block w-full rounded-2xl border border-black/[0.14] bg-white/25 px-3.5 py-2.5 text-left text-[12.5px] leading-relaxed text-black/55 transition-colors hover:bg-white/40"
      >
        {text}
      </button>
      {/* 发丝线，末端小花收尾 */}
      <div className="mt-2 flex items-center gap-2 pl-1">
        <div className="h-px flex-1 bg-black/[0.13]" />
        <span className="text-[11px] leading-none text-black/30">❀</span>
      </div>
    </div>
  );
}

/** 好感进度：当前等级 → 下一等级的发丝进度条（参考播放器进度样式） */
function AffectionBar({ points }: { points: number }) {
  const idx = AFFECTION_LEVELS.findIndex((l) => points < l.min);
  const next = idx === -1 ? null : AFFECTION_LEVELS[idx];
  const prev = next ? AFFECTION_LEVELS[idx - 1] : AFFECTION_LEVELS[AFFECTION_LEVELS.length - 1];
  const pct = next ? Math.min(1, (points - prev.min) / (next.min - prev.min)) : 1;
  return (
    <div className="relative mt-3 h-px w-full bg-black/15">
      <div className="absolute inset-y-0 left-0 bg-black/55 transition-all duration-700" style={{ width: `${pct * 100}%` }} />
      <div
        className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#2b2b2b] transition-all duration-700"
        style={{ left: `max(2px, calc(${pct * 100}% - 5px))` }}
      />
    </div>
  );
}

export function ChatPage({ c }: { c: Companion }) {
  const [input, setInput] = useState("");
  const [pendingImg, setPendingImg] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState(false);
  const [thoughtOpen, setThoughtOpen] = useState(false);
  const [thoughtInput, setThoughtInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const anniversary = anniversaryText(c.days);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [c.messages, c.typing]);

  /* 键盘弹出/收起改变可视高度时，始终把最新消息贴在输入框上方 */
  useEffect(() => {
    const onResize = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, []);

  const pickImage = async (file: File) => {
    setImgBusy(true);
    try {
      setPendingImg(await fileToDataUri(file));
    } catch (e) {
      alert(e instanceof Error ? e.message : "图片处理失败");
    } finally {
      setImgBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  /* ✦ 上传入口：图片走识图流程；txt/md 等文本直接填入输入框 */
  const pickFile = async (file: File) => {
    if (file.type.startsWith("image/")) return pickImage(file);
    if (/\.(txt|md|markdown|log|csv|json)$/i.test(file.name) && file.size <= 200 * 1024) {
      const text = (await file.text()).trim();
      if (text) {
        setInput((s) => (s.trim() ? `${s.trim()}\n${text}` : text));
        c.toast("已把文本文件内容放入输入框", "info");
      }
    } else {
      c.toast("暂支持图片，或 200KB 内的 txt / md 文本", "info");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = () => {
    const text = input.trim();
    if ((!text && !pendingImg) || c.typing) return;
    const thought = thoughtInput.trim() || undefined;
    setInput("");
    setThoughtInput("");
    setThoughtOpen(false);
    void c.send(text, pendingImg ?? undefined, thought);
    setPendingImg(null);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏：头像 + 心情 + 芯片 */}
      <header className="glass-deep z-10 px-5 pb-4 pt-4">
        <div className="flex items-center gap-3.5">
          <div className={c.typing ? "animate-breathe avatar-halo rounded-2xl" : "rounded-2xl"}>
            <Avatar card={c.card} className="h-12 w-12 border border-white/70" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <h1 className="font-script truncate text-[26px] leading-none text-[#1f1f1f]">{c.card.name}</h1>
              <span className="font-caption shrink-0 text-[13px] text-black/45">
                {c.typing ? "écrit…" : c.level.mood}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-black/55">
              <span className="glass rounded-full px-2.5 py-1">
                <span className="emoji-mono mr-1">{c.level.emoji}</span>
                {c.level.name} · 好感 {c.affection}
              </span>
              <span className="glass rounded-full px-2.5 py-1">相识第 {c.days} 天</span>
            </div>
          </div>
        </div>
        <AffectionBar points={c.affection} />
      </header>

      {/* 纪念日横幅 */}
      {anniversary && (
        <div className="bubble-in z-0 mx-5 mt-3 rounded-full glass px-5 py-2 text-center text-[13px] tracking-wide text-black/70">
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-rose align-middle" />
          <span className="emoji-mono">{anniversary}</span>
        </div>
      )}

      {/* 消息列表 */}
      <div ref={scrollRef} className="chat-scroll z-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {c.messages.map((m, i) => {
          const isUser = m.role === "user";
          const isLastAssistant = !isUser && i === c.messages.length - 1;
          const streaming = isLastAssistant && c.typing && m.content.length > 0;
          return (
            <div key={m.id} className={`bubble-in flex gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
              <Avatar card={isUser ? { ...c.card, avatar: "🙂", avatarImg: undefined } : c.card} className="h-9 w-9 rounded-xl border border-white/60" />
              <div className={`max-w-[76%] ${isUser ? "text-right" : ""}`}>
                {!isUser && <div className="font-caption mb-1 pl-1 text-xs text-black/40">{c.card.name}</div>}
                {!isUser && m.thought?.trim() && c.settings.showThought && (
                  <AssistantThought text={m.thought} />
                )}
                {!isUser && m.thinking?.trim() && c.settings.showThinking && (
                  <ThinkingBlock text={m.thinking} />
                )}
                {isUser && m.image && (
                  <img
                    src={m.image}
                    alt="发送的图片"
                    className="mb-1.5 max-h-44 rounded-2xl border border-white/60 object-cover"
                  />
                )}
                <div
                  className={`inline-block whitespace-pre-wrap break-words rounded-[22px] px-4 py-2.5 text-left text-[15px] leading-relaxed ${
                    isUser
                      ? "bubble-user rounded-tr-md text-white/95"
                      : "bubble-ai rounded-tl-md text-[#262626]"
                  } ${streaming ? "stream-cursor" : ""}`}
                >
                  {m.content || (c.typing ? <TypingDots /> : "…")}
                </div>
                {isUser && m.thought?.trim() && c.settings.showThought && (
                  <UserThought
                    thought={m.thought}
                    seenAt={m.thoughtSeenAt}
                    onEdit={(t) => void c.editThought(m.id, t)}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 底部装饰 + 输入栏 */}
      <div className="relative z-10 px-5 pb-1 pt-2">
        {/* 已挂药丸提示（用完即焚，发送后由 send 取走） */}
        <PillChip />
        {/* 附言输入：没说出口的话，TA 只在需要时调用工具才会读到 */}
        {thoughtOpen && (
          <div className="bubble-in mb-2 rounded-2xl bg-black/[0.04] p-2 ring-1 ring-black/10">
            <textarea
              value={thoughtInput}
              onChange={(e) => setThoughtInput(e.target.value)}
              rows={2}
              maxLength={4000}
              autoFocus
              placeholder="没说出口的话…（TA 只看到一个标记，想读了才会调用工具来取）"
              className="font-caption w-full resize-none rounded-xl bg-white/50 px-3 py-2 text-[13px] leading-relaxed text-[#262626] placeholder:text-black/30 focus:outline-none"
            />
            <p className="font-caption mt-1 pr-1 text-right text-[11px] text-black/35">
              未读之前可以改 · 被 TA 读过之后就锁定
            </p>
          </div>
        )}
        {/* 待发送图片预览 */}
        {pendingImg && (
          <div className="bubble-in mb-2 flex items-center gap-2 pl-1">
            <img src={pendingImg} alt="待发送图片" className="h-16 w-16 rounded-2xl border border-white/70 object-cover" />
            <button
              onClick={() => setPendingImg(null)}
              className="grid h-7 w-7 place-items-center rounded-full bg-black/10 text-[12px] text-black/60 transition-colors hover:bg-black/20"
              aria-label="移除图片"
            >
              ✕
            </button>
            {!c.settings.enableVision && (
              <span className="font-caption text-[12px] text-black/45">— 图片识别未开启，模型只会收到文字提示</span>
            )}
          </div>
        )}
        <div className="flex items-end gap-2.5">
          <div className="glow-focus glass-deep flex min-h-[56px] flex-1 items-end rounded-[26px] p-2 transition-shadow">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.txt,.md,.markdown,.log,.csv,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickFile(f);
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={imgBusy}
              aria-label="发送图片或文件"
              title="发送图片或文件"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[16px] text-black/45 transition-colors hover:bg-black/[0.06] hover:text-black/70 disabled:opacity-40"
            >
              {imgBusy ? "…" : "✦"}
            </button>
            <button
              onClick={() => requestCallStart()}
              aria-label="语音通话"
              title="语音通话：轮流说话的实时语音，支持中英双语"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[16px] text-black/45 transition-colors hover:bg-black/[0.06] hover:text-black/70"
            >
              ☏
            </button>
            <button
              onClick={() => setThoughtOpen((v) => !v)}
              aria-label="附上一段没说出口的思考"
              title="附言：一段没说出口的思考，TA 只在需要时调用工具读取"
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] transition-colors ${
                thoughtOpen || thoughtInput.trim()
                  ? "bg-black/[0.08] text-black/80"
                  : "text-black/45 hover:bg-black/[0.06] hover:text-black/70"
              }`}
            >
              💭
            </button>
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="écrire…"
              className="font-caption max-h-32 min-h-[40px] flex-1 resize-none border-0 bg-transparent px-1 text-[15px] text-[#262626] focus-visible:ring-0"
              rows={1}
            />
            {c.typing ? (
              <button
                onClick={c.stop}
                aria-label="停止生成"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/15 text-[11px] text-black/60 transition-colors hover:bg-black/25"
              >
                ■
              </button>
            ) : (
              <button
                onClick={submit}
                disabled={!input.trim() && !pendingImg}
                aria-label="发送"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#2b2b2b] text-white transition-all hover:bg-black disabled:opacity-30"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5" />
                  <path d="m5 12 7-7 7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="font-caption mt-2 flex items-center gap-2 pl-2 text-[13px] text-black/40">
          <span className="text-base leading-none">☾</span>
          <span className="text-base leading-none">✦</span>
          <span>écrivons quelque chose de doux</span>
        </div>
      </div>
    </div>
  );
}

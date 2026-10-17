/**
 * App.tsx — 应用外壳：灰调植物背景 + 底部磨砂导航 + 全局提示
 */
import { useState } from "react";
import { useCompanion } from "@/hooks/useCompanion";
import { loadSettings } from "@/lib/db";
import { useIosKeyboardPolish } from "@/lib/iosKeyboard";
import { ChatPage } from "@/modules/chat/ChatPage";
import { CharacterPanel } from "@/modules/character/CharacterPanel";
import { MemoryHome } from "@/modules/latent/MemoryHome";
import { SettingsPanel } from "@/modules/settings/SettingsPanel";
import { AppsPanel } from "@/modules/apps/AppsPanel";
import { LockScreen } from "@/modules/lock/LockScreen";
import { BodyPanel } from "@/modules/body/BodyPanel";
import { TidePanel } from "@/modules/tide/TidePanel";
import { BG_GARDEN } from "./assets-gen";

type Tab = "chat" | "character" | "memory" | "body" | "tide" | "apps" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "chat", label: "聊天", icon: "✎" },
  { id: "character", label: "角色", icon: "❀" },
  { id: "memory", label: "记忆", icon: "✦" },
  { id: "body", label: "生理", icon: "♡" },
  { id: "tide", label: "心潮", icon: "≋" },
  { id: "apps", label: "应用", icon: "❖" },
  { id: "settings", label: "设置", icon: "☾" },
];

export default function App() {
  const c = useCompanion();
  const [tab, setTab] = useState<Tab>("chat");
  // 开屏门锁：每次加载读取一次设置；解锁状态只保留在本次使用期间
  const [lockOn] = useState(() => loadSettings().lockEnabled);
  const [unlocked, setUnlocked] = useState(false);

  /* iOS 真机键盘打磨：聚焦输入框自动滚进可视区 */
  useIosKeyboardPolish();

  /* iOS 真机 PWA 适配：动态视口高度 + 键盘弹出自动收缩（见 iosKeyboard.ts） */

  return (
    <div className="relative mx-auto flex w-full max-w-2xl flex-col" style={{ height: "var(--app-height, 100dvh)" }}>
      {lockOn && !unlocked && <LockScreen onUnlock={() => setUnlocked(true)} />}
      {/* 全屏背景：灰调植物庭院插画 */}
      <div className="fixed inset-0 -z-10">
        <img src={BG_GARDEN} alt="" className="h-full w-full object-cover" draggable={false} />
      </div>

      {/* 主区域 */}
      <main className="min-h-0 flex-1">
        {c.ready ? (
          tab === "chat" ? (
            <ChatPage c={c} />
          ) : tab === "character" ? (
            <CharacterPanel c={c} />
          ) : tab === "memory" ? (
            <MemoryHome c={c} />
          ) : tab === "body" ? (
            <BodyPanel c={c} />
          ) : tab === "tide" ? (
            <TidePanel c={c} />
          ) : tab === "apps" ? (
            <AppsPanel />
          ) : (
            <SettingsPanel c={c} />
          )
        ) : (
          <div className="grid h-full place-items-center">
            <div className="animate-breathe font-script text-5xl text-black/60">S</div>
          </div>
        )}
      </main>

      {/* 底部磨砂导航 */}
      <nav
        className="glass-deep z-10 mx-4 mb-3 grid shrink-0 grid-cols-7 rounded-full px-2 py-1.5"
        style={{ marginBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-col items-center gap-0.5 rounded-full py-1.5 text-[10px] tracking-widest transition-all ${
              tab === t.id ? "bg-black/[0.06] font-medium text-[#1f1f1f]" : "text-black/40 hover:text-black/60"
            }`}
          >
            <span className={`text-[15px] leading-none ${tab === t.id ? "animate-heart-pop" : ""}`}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>

      {/* 全局提示（好感度变化等） */}
      <div className="pointer-events-none fixed left-1/2 top-4 z-50 flex w-full max-w-2xl -translate-x-1/2 flex-col items-center gap-2 px-4">
        {c.toasts.map((t) => (
          <div
            key={t.id}
            className={`bubble-in glass-deep rounded-full px-5 py-2 text-[13px] tracking-wide text-[#262626] ${
              t.kind === "heart" ? "ring-1 ring-rose/40" : ""
            }`}
          >
            {t.kind === "heart" && <span className="mr-1.5 text-rose">♥</span>}
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

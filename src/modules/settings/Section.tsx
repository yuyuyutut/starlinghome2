/**
 * settings/Section.tsx — 可折叠的设置模块卡片
 * 头部（法文花体字标题 + 中文说明 + 箭头）点击展开/收起，收起时不占地方。
 */
import { useState, type ReactNode } from "react";

export function Section({
  zh,
  fr,
  defaultOpen = false,
  children,
}: {
  zh: string;
  fr: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="glass-deep rounded-[28px] p-5">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group flex w-full items-center justify-between"
      >
        <div className="text-left">
          <div className="font-script text-[22px] leading-none text-[#1f1f1f]">{fr}</div>
          <div className="font-caption mt-1 text-[13px] text-black/45">{zh}</div>
        </div>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-black/40 transition-transform duration-300 group-hover:text-black/60 ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && <div className="bubble-in mt-4">{children}</div>}
    </div>
  );
}

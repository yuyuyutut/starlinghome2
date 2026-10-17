/**
 * apps/apps.tsx — 「应用」板块注册表
 * 每新增一个小应用：在 APP_SECTIONS 里追加一项即可（组件放在本目录下的独立文件里）。
 * 面板会自动渲染为与「设置」一致的可折叠玻璃卡片，无需改动 AppsPanel。
 */
import type { ReactNode } from "react";
import { PillSection } from "@/modules/pills/PillSection";

export type AppSection = {
  /** 唯一标识 */
  id: string;
  /** 中文说明（卡片副标题） */
  zh: string;
  /** 花体标题（卡片主标题，与设置板块风格一致） */
  fr: string;
  /** 默认是否展开 */
  defaultOpen?: boolean;
  /** 板块内容 */
  render: () => ReactNode;
};

export const APP_SECTIONS: AppSection[] = [
  {
    id: "pilulier",
    zh: "挑一颗药丸，只作用下一次回复，用完即焚",
    fr: "Pilulier",
    defaultOpen: true,
    render: () => <PillSection />,
  },
];

/**
 * apps/AppsPanel.tsx — 「应用」面板
 * 可折叠的小应用合集，板块来自 ./apps 注册表；
 * 视觉与设置面板一致：灰调玻璃卡片 + 花体标题 + 中文说明。
 */
import { Section } from "@/modules/settings/Section";
import { APP_SECTIONS } from "./apps";

export function AppsPanel() {
  return (
    <div className="chat-scroll h-full overflow-y-auto px-5 py-6">
      <div className="mx-auto max-w-lg space-y-5">
        {APP_SECTIONS.length === 0 ? (
          /* 尚无小应用时的占位卡片 */
          <div className="glass-deep rounded-[28px] p-5">
            <div className="font-script text-[22px] leading-none text-[#1f1f1f]">Applications</div>
            <div className="font-caption mt-1 text-[13px] text-black/45">应用</div>
            <p className="font-caption mt-4 rounded-2xl bg-black/[0.04] px-3 py-2 text-[12.5px] leading-relaxed text-black/50">
              — 这里会收录各种小应用：游戏、日记、语音……一个一个慢慢长出来 ✦
            </p>
          </div>
        ) : (
          APP_SECTIONS.map((s) => (
            <Section key={s.id} zh={s.zh} fr={s.fr} defaultOpen={s.defaultOpen}>
              {s.render()}
            </Section>
          ))
        )}

        <p className="font-caption pb-4 text-center text-[13px] text-black/40">✧ petit à petit, l'oiseau fait son nid</p>
      </div>
    </div>
  );
}

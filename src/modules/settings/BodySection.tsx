/**
 * settings/BodySection.tsx — 设置里的「生理系统」模块（独立 Section）
 * Eventide 宿主开关：总开关（tick + 事件）、状态卡注入、称呼触发词。
 */
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Settings } from "@/lib/db";
import { Section } from "./Section";

export function BodySection({
  form,
  onChange,
}: {
  form: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  return (
    <Section zh="生理系统（Eventide 身体涨落）" fr="Corps">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-normal leading-relaxed text-black/60">
          随时间与互动推进 TA 的身体周期（平稳 → 蓄积 → 预兆 → 易感 → 退潮），七项数值以
          &lt;ephemeral_state&gt; 隐藏状态卡注入每轮请求
        </p>
        <Switch checked={form.bodyCycle} onCheckedChange={(v) => onChange({ bodyCycle: v })} />
      </div>
      <p className="font-caption mt-2 text-[12px] italic leading-relaxed text-black/40">
        — 关闭后不再推进身体状态，面板保留展示
      </p>

      {form.bodyCycle && (
        <div className="mt-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] font-normal leading-relaxed text-black/60">
              注入状态卡：把当前周期、主事件和七项档位描述写进系统提示词（阅后即焚，不进聊天记录）
            </p>
            <Switch checked={form.bodyInject} onCheckedChange={(v) => onChange({ bodyInject: v })} />
          </div>

          <div>
            <div className="font-caption text-[12px] text-black/50">称呼 / 触发词（逗号分隔，命中可触发「声音 / 称呼触发」）</div>
            <Textarea
              value={form.bodyTriggers}
              onChange={(e) => onChange({ bodyTriggers: e.target.value })}
              placeholder="例如：宝贝、先生、daddy"
              className="mt-1.5 min-h-[64px] resize-none rounded-2xl border-black/10 bg-white/40 text-[14px] font-light focus-visible:ring-0"
            />
            <p className="font-caption mt-1.5 text-[11px] italic leading-relaxed text-black/35">
              命中且当前没有主事件时按概率触发；已有主事件时只把刺激小幅写进敏感度 / 占有欲 / 压抑感
            </p>
          </div>
        </div>
      )}
    </Section>
  );
}

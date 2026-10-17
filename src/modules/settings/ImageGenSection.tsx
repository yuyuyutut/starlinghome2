/**
 * settings/ImageGenSection.tsx — 设置里的「生图」模块（独立 Section）
 * · API 链接：服务商预设（OpenAI 官方/第三方）+ 地址/密钥/模型 + 拉取 + 端点测试
 * · 生图设置：图片尺寸 / 质量 / 预设组（正负预设词命名保存）/ 恢复默认
 * · 测试生图：用当前配置真出一张图，内联预览
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Settings } from "@/lib/db";
import { Section } from "./Section";
import { ConnFields } from "./ModelConnections";
import { IMAGE_PROVIDERS, generateImage, testImageGenEndpoint, type ImageGenResult } from "../image/gen";
import { deleteImagePreset, listImagePresets, saveImagePreset, type ImagePreset } from "./imagePresets";

const SIZES = [
  { id: "1024x1024", label: "1024 × 1024（1:1）" },
  { id: "1024x1536", label: "1024 × 1536（2:3 竖）" },
  { id: "1536x1024", label: "1536 × 1024（3:2 横）" },
  { id: "512x512", label: "512 × 512（1:1 小图）" },
];

const QUALITIES = [
  { id: "auto", label: "auto（跟随服务商默认）" },
  { id: "low", label: "low（gpt-image-1）" },
  { id: "medium", label: "medium（gpt-image-1）" },
  { id: "high", label: "high（gpt-image-1）" },
  { id: "standard", label: "standard（DALL·E 3）" },
  { id: "hd", label: "hd（DALL·E 3）" },
];

/** 测试生图的主体：固定的温柔小场景，只验证链路不管审美 */
const TEST_SUBJECT = "a small fox sleeping on a wooden windowsill, warm morning light";

const selectCls =
  "underline-input h-9 w-full bg-transparent text-[15px] font-light focus-visible:ring-0";
const textareaCls =
  "min-h-[88px] w-full rounded-2xl border-0 bg-black/[0.04] px-4 py-3 text-[13.5px] font-light leading-relaxed text-[#262626] placeholder:text-black/30 focus-visible:ring-1 focus-visible:ring-black/15";

export function ImageGenSection({ form, onChange }: { form: Settings; onChange: (patch: Partial<Settings>) => void }) {
  /* ---------- 预设组 ---------- */
  const [presets, setPresets] = useState<ImagePreset[]>(() => listImagePresets());
  const [presetName, setPresetName] = useState("");
  const activePreset = presets.find((p) => p.positive === form.imagePositive && p.negative === form.imageNegative);

  const applyPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    onChange({ imagePositive: p.positive, imageNegative: p.negative });
    setPresetName(p.name);
  };
  const savePreset = () => {
    const name = presetName.trim() || activePreset?.name;
    if (!name) return;
    setPresets(saveImagePreset({ name, positive: form.imagePositive, negative: form.imageNegative }));
  };
  const removePreset = (id: string) => {
    setPresets(deleteImagePreset(id));
    if (activePreset?.id === id) setPresetName("");
  };

  /* ---------- 测试生图 ---------- */
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testOk, setTestOk] = useState(false);
  const [preview, setPreview] = useState<ImageGenResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);

  const testGen = async () => {
    const apiKey = form.imageApiKey.trim() || form.apiKey.trim();
    if (!apiKey) {
      setTestOk(false);
      setTestMsg("先填生图密钥（或沿用聊天的 Key）");
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setTesting(true);
    setTestMsg(null);
    setPreview(null);
    const t0 = performance.now();
    try {
      const r = await generateImage(
        {
          baseUrl: form.imageBaseUrl.trim() || form.baseUrl.trim(),
          apiKey,
          model: form.imageModel.trim() || "gpt-image-1",
          size: form.imageSize,
          quality: form.imageQuality,
          positive: form.imagePositive,
          negative: form.imageNegative,
        },
        TEST_SUBJECT,
        ac.signal
      );
      const ms = Math.round(performance.now() - t0);
      setPreview(r);
      setTestOk(true);
      setTestMsg(`出图成功 · ${ms / 1000}s`);
    } catch (e) {
      if (ac.signal.aborted) return;
      setTestOk(false);
      setTestMsg(`生图失败：${e instanceof Error ? e.message : e}`);
    } finally {
      if (!ac.signal.aborted) setTesting(false);
    }
  };

  return (
    <Section zh="生图" fr="Image">
      {/* API 链接 */}
      <ConnFields
        zh="API 链接"
        note="ChatGPT 官方或第三方生图服务"
        form={form}
        keys={{ base: "imageBaseUrl", key: "imageApiKey", model: "imageModel" }}
        onChange={onChange}
        providers={IMAGE_PROVIDERS}
        pullFilter={/image|dall|cogview|seedream|kolors|flux|sd|diffusion|wanx|paint/i}
        test={async (base, key, model) => testImageGenEndpoint(base, key, model)}
      />

      <div className="hairline-b my-5" />

      {/* 生图设置 */}
      <div className="space-y-4">
        <div className="flex items-baseline justify-between">
          <Label className="text-[13px] font-normal text-black/70">生图设置</Label>
          <button
            type="button"
            onClick={() => {
              onChange({ imageSize: "1024x1024", imageQuality: "auto" });
              onChange({
                imagePositive:
                  "semi-realistic anime portrait, polished digital painting, painterly rendering, soft blended brushwork, smooth skin shading, refined facial features",
                imageNegative:
                  "low quality, blurry, overexposed, oversaturated, harsh cel shading, sketchy lines, watercolor texture, thick lineart, rough brushstrokes, bad anatomy",
              });
            }}
            className="font-caption text-[12px] text-black/40 underline decoration-black/20 underline-offset-4 hover:text-black/60"
          >
            恢复默认
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[13px] font-normal text-black/70">图片尺寸</Label>
            <select
              value={form.imageSize}
              onChange={(e) => onChange({ imageSize: e.target.value })}
              className={selectCls}
            >
              {SIZES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-[13px] font-normal text-black/70">图片质量</Label>
            <select
              value={form.imageQuality}
              onChange={(e) => onChange({ imageQuality: e.target.value })}
              className={selectCls}
            >
              {QUALITIES.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="font-caption -mt-1 text-[12px] text-black/40">
          gpt-image-1 支持 low/medium/high；DALL·E 3 支持 standard/hd；auto 时不传质量参数
        </p>

        {/* 预设组 */}
        <div className="space-y-1.5">
          <Label className="text-[13px] font-normal text-black/70">预设组</Label>
          <div className="flex items-center gap-2">
            {presets.length > 0 && (
              <select
                value={activePreset?.id ?? ""}
                onChange={(e) => applyPreset(e.target.value)}
                className={`${selectCls} flex-1`}
              >
                <option value="">选择预设…</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <Input
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="预设名"
              className="underline-input h-9 flex-1 text-[15px] font-light focus-visible:ring-0"
            />
            <Button
              onClick={savePreset}
              variant="secondary"
              className="glass h-9 shrink-0 rounded-full px-4 text-[13px] font-normal text-black/70 hover:bg-white/70"
            >
              保存
            </Button>
            {activePreset && (
              <button
                type="button"
                onClick={() => removePreset(activePreset.id)}
                className="shrink-0 text-[12px] text-rose/70 hover:text-rose"
                title="删除该预设"
              >
                删除
              </button>
            )}
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[13px] font-normal text-black/70">正面预设词</Label>
          <Textarea
            value={form.imagePositive}
            onChange={(e) => onChange({ imagePositive: e.target.value })}
            placeholder="画风、质感、光线…"
            className={textareaCls}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[13px] font-normal text-black/70">负面预设词</Label>
          <Textarea
            value={form.imageNegative}
            onChange={(e) => onChange({ imageNegative: e.target.value })}
            placeholder="不想出现的元素…"
            className={textareaCls}
          />
          <p className="font-caption text-[12px] text-black/40">
            OpenAI 系不支持独立负面词，会以 "Avoid: …" 附加到 prompt；SD 系第三方会走 negative_prompt 参数
          </p>
        </div>
      </div>

      <div className="hairline-b my-5" />

      {/* 测试生图 */}
      <div className="space-y-3">
        <Button
          onClick={testGen}
          disabled={testing}
          variant="secondary"
          className="glass h-11 w-full rounded-full text-[14px] font-normal tracking-widest text-black/70 hover:bg-white/70"
        >
          {testing ? "生成中…" : "▣ 测试生图"}
        </Button>
        {testMsg && (
          <p className={`text-center text-[12.5px] ${testOk ? "text-emerald-800/80" : "text-rose"}`}>{testMsg}</p>
        )}
        {preview && (
          <div className="bubble-in overflow-hidden rounded-3xl bg-black/[0.03] ring-1 ring-black/10">
            <img src={preview.src} alt="测试生图" className="mx-auto max-h-80 w-auto object-contain" />
            {preview.revisedPrompt && (
              <p className="font-caption px-4 py-2.5 text-[11.5px] leading-relaxed text-black/40">
                服务商改写后的 prompt：{preview.revisedPrompt}
              </p>
            )}
          </div>
        )}
      </div>
    </Section>
  );
}

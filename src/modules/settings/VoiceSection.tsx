/**
 * settings/VoiceSection.tsx — 设置里的「语音通话」模块（独立 Section）
 * OpenAI 兼容 /audio/speech 独立连接（留空沿用聊天）+ 音色；
 * 识别用浏览器 Web Speech API（Chrome/Edge），无需额外配置。
 */
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Settings } from "@/lib/db";
import { Section } from "./Section";
import { ConnFields } from "./ModelConnections";

/** 端点测试：只验证 /audio/speech 可用，不自动播放（教程：示例不得自动调用付费合成） */
async function testVoiceEndpoint(base: string, key: string, model: string) {
  const t0 = performance.now();
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/audio/speech`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: model || "tts-1", input: "hi", voice: "alloy", response_format: "pcm" }),
    });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return { ok: true, message: `可用 · ${(performance.now() - t0) / 1000}s · ${Math.round(buf.byteLength / 1024)} KB` };
    }
    const detail = (await res.text().catch(() => "")).slice(0, 80);
    return { ok: false, message: `不可用（${res.status}）${detail ? `：${detail}` : ""}` };
  } catch (e) {
    return { ok: false, message: `连接失败：${e instanceof Error ? e.message : e}` };
  }
}

export function VoiceSection({ form, onChange }: { form: Settings; onChange: (patch: Partial<Settings>) => void }) {
  return (
    <Section zh="语音通话（实时语音）" fr="Voix">
      <ConnFields
        zh="语音合成服务"
        note="OpenAI 兼容 /audio/speech（留空沿用聊天）"
        form={form}
        keys={{ base: "voiceBaseUrl", key: "voiceApiKey", model: "voiceModel" }}
        onChange={onChange}
        providers={[
          { id: "openai", name: "OpenAI 官方", baseUrl: "https://api.openai.com/v1", model: "tts-1" },
          { id: "azure", name: "Azure OpenAI", baseUrl: "https://your-resource.openai.azure.com/openai/deployments/tts-1", model: "tts-1" },
        ]}
        pullFilter={/tts|speech|audio|voice/i}
        test={testVoiceEndpoint}
      />

      <div className="mt-4 space-y-1.5">
        <Label className="text-[13px] font-normal text-black/70">音色</Label>
        <Input
          value={form.voiceName}
          onChange={(e) => onChange({ voiceName: e.target.value })}
          placeholder="alloy"
          className="underline-input h-9 text-[15px] font-light focus-visible:ring-0"
        />
        <p className="font-caption text-[12px] text-black/40">
          OpenAI 系常用 alloy / nova / echo / fable / onyx / shimmer / coral / verse；第三方按自家音色名填写
        </p>
      </div>

      <p className="font-caption mt-4 text-[12px] italic leading-relaxed text-black/40">
        — 通话为轮流说话：识别用浏览器内置能力（Chrome / Edge 效果最佳，Safari 可能不支持），
        合成逐句流式播放；说中文听英文、说英文听中文的双语模式在通话界面切换，只影响下一轮
      </p>
    </Section>
  );
}

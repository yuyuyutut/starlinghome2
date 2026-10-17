/**
 * settings/ModelConnections.tsx — API 连接：总结 / 识图 两组独立配置
 * 每组都可单独填 地址 / 密钥 / 模型（留空沿用聊天配置），带拉取模型、测试连接。
 * 聊天模型本身的连接 UI 仍由 SettingsPanel 直接渲染（含用户自定义预设），这里不动它。
 * 生图已单独拆成设置里的「生图」模块（ImageGenSection），不在此渲染。
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Settings } from "@/lib/db";
import { fetchModels, testConnection } from "@/lib/llm";

type ConnState = { testing: boolean; ok?: boolean; message?: string };

/** 1×1 透明 PNG（data URI），识图测试用的最小图片 */
const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** 识图测试：真发一张 1×1 小图，确认该模型吃 image_url（花一次极小的 token） */
async function testVisionSupport(baseUrl: string, apiKey: string, model: string): Promise<Omit<ConnState, "testing">> {
  try {
    const res = await fetch(baseUrl.replace(/\/+$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || "gpt-4o-mini",
        max_tokens: 1,
        messages: [
          { role: "user", content: [
            { type: "text", text: "hi" },
            { type: "image_url", image_url: { url: TINY_PNG } },
          ] },
        ],
      }),
    });
    if (res.ok) return { ok: true, message: "连接成功 · 识图能力已确认 ✓" };
    const body = await res.text().catch(() => "");
    if (res.status === 400 && /image|vision|modal|unsupported|不支持/i.test(body)) {
      return { ok: false, message: `连上了，但该模型不收图（${res.status}）` };
    }
    return { ok: false, message: `服务返回 ${res.status}` };
  } catch (e) {
    return { ok: false, message: `网络请求失败：${e instanceof Error ? e.message : e}` };
  }
}

/** 一组 地址/密钥/模型 输入 + 拉取 + 测试 的通用子块 */
export function ConnFields({
  zh, note, form, keys, onChange, providers, pullFilter, test,
}: {
  zh: string;
  note: string;
  form: Settings;
  keys: { base: keyof Settings; key: keyof Settings; model: keyof Settings };
  onChange: (patch: Partial<Settings>) => void;
  providers?: { id: string; name: string; baseUrl: string; model: string; hint?: string }[];
  pullFilter?: RegExp;
  test: (base: string, key: string, model: string) => Promise<Omit<ConnState, "testing">>;
}) {
  const [conn, setConn] = useState<ConnState>({ testing: false });
  const [models, setModels] = useState<string[] | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);
  const base = (form[keys.base] as string).trim();
  const key = (form[keys.key] as string).trim();
  const model = (form[keys.model] as string).trim();
  const effBase = base || form.baseUrl.trim();
  const effKey = key || form.apiKey.trim();
  const inputCls = "underline-input h-9 text-[15px] font-light focus-visible:ring-0";
  const activeProvider = providers?.find((p) => p.baseUrl === base);

  const doPull = async () => {
    if (!effKey) {
      setPullMsg("先填密钥（或沿用聊天的 Key）再拉取");
      return;
    }
    setPulling(true);
    setPullMsg(null);
    try {
      const ids = await fetchModels(effBase, effKey);
      const list = pullFilter ? ids.filter((id) => pullFilter.test(id)) : ids;
      setModels(list);
      if (list.length > 0) onChange({ [keys.model]: list.includes(model) ? form[keys.model] : list[0] } as Partial<Settings>);
      setPullMsg(list.length > 0 ? `已拉取 ${list.length} 个模型 ✓` : "没有匹配的模型，可手动填模型名");
    } catch (e) {
      setModels(null);
      setPullMsg(`拉取失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setPulling(false);
    }
  };

  const doTest = async () => {
    if (!effKey) {
      setConn({ testing: false, ok: false, message: "先填密钥（或沿用聊天的 Key）再测试" });
      return;
    }
    setConn({ testing: true });
    setConn({ testing: false, ...(await test(effBase, effKey, model)) });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <Label className="text-[13px] font-normal text-black/70">{zh}</Label>
        <span className="font-caption text-[12px] text-black/40">{note}</span>
      </div>
      {providers && (
        <div className="flex flex-wrap gap-1.5">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange({ [keys.base]: p.baseUrl, [keys.model]: p.model } as Partial<Settings>);
                setModels(null);
                setPullMsg(null);
              }}
              className={`glass rounded-full px-3 py-1 text-[12px] tracking-wide transition-all ${
                activeProvider?.id === p.id ? "text-[#1f1f1f] ring-1 ring-black/25" : "text-black/50 hover:text-black/75"
              }`}
            >
              {p.name.startsWith("OpenAI") ? "◆ " : ""}
              {p.name}
            </button>
          ))}
        </div>
      )}
      {activeProvider?.hint && <p className="font-caption text-[12px] text-black/40">{activeProvider.hint}</p>}
      <div className="space-y-1">
        <Label className="text-[13px] font-normal text-black/70">API 地址（留空沿用聊天）</Label>
        <Input
          value={form[keys.base] as string}
          onChange={(e) => onChange({ [keys.base]: e.target.value } as Partial<Settings>)}
          placeholder="https://api.openai.com/v1"
          className={inputCls}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[13px] font-normal text-black/70">API 密钥（留空沿用聊天）</Label>
        <Input
          type="password"
          value={form[keys.key] as string}
          onChange={(e) => onChange({ [keys.key]: e.target.value } as Partial<Settings>)}
          placeholder="sk-…"
          className={inputCls}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[13px] font-normal text-black/70">模型名（留空沿用聊天）</Label>
        <div className="flex items-center gap-2">
          <Input
            value={form[keys.model] as string}
            onChange={(e) => onChange({ [keys.model]: e.target.value } as Partial<Settings>)}
            placeholder="留空沿用聊天模型"
            className={inputCls}
          />
          <Button
            onClick={doPull}
            disabled={pulling}
            variant="secondary"
            className="glass h-9 shrink-0 rounded-full px-4 text-[13px] font-normal text-black/70 hover:bg-white/70"
          >
            {pulling ? "拉取中…" : "拉取模型"}
          </Button>
        </div>
        {models && (
          <select
            value={form[keys.model] as string}
            onChange={(e) => onChange({ [keys.model]: e.target.value } as Partial<Settings>)}
            className={`${inputCls} w-full bg-transparent`}
          >
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        )}
        {pullMsg && (
          <p className={`font-caption text-[12px] ${pullMsg.includes("失败") || pullMsg.includes("先填") || pullMsg.includes("没有") ? "text-rose/80" : "text-emerald-800/80"}`}>
            {pullMsg}
          </p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Button
          onClick={doTest}
          disabled={conn.testing}
          variant="secondary"
          className="glass h-9 rounded-full px-4 text-[13px] font-normal text-black/70 hover:bg-white/70"
        >
          {conn.testing ? "测试中…" : "测试连接"}
        </Button>
        {conn.message && (
          <span className={`text-[12px] ${conn.ok ? "text-emerald-800/80" : "text-rose"}`}>{conn.message}</span>
        )}
      </div>
    </div>
  );
}

/** 总结 / 识图 两组连接，挂在「连接你的模型服务」Section 里聊天配置下方（生图已拆为独立模块） */
export function ModelConnections({ form, onChange }: { form: Settings; onChange: (patch: Partial<Settings>) => void }) {
  return (
    <div className="mt-5 space-y-5">
      <div className="hairline-b" />
      <ConnFields
        zh="总结模型"
        note="AI 整理记忆时用 · 可配便宜的小模型"
        form={form}
        keys={{ base: "summaryBaseUrl", key: "summaryApiKey", model: "summaryModel" }}
        onChange={onChange}
        test={async (base, key) => testConnection(base, key)}
      />
      <div className="hairline-b" />
      <ConnFields
        zh="识图模型"
        note="聊天发图时用 · 需支持 image_url"
        form={form}
        keys={{ base: "visionBaseUrl", key: "visionApiKey", model: "visionModel" }}
        onChange={onChange}
        test={async (base, key, model) => testVisionSupport(base, key, model)}
      />
    </div>
  );
}

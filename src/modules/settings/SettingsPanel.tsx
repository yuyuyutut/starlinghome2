/**
 * settings/SettingsPanel.tsx — 设置（灰调玻璃风格，可折叠模块）
 * Paramètres（API 连接/预设/拉取模型）· Pensée（思维链）· Génération（生成参数+思考预算）
 * · Souvenir（自动整理）· Sauvegarde（备份）· Danger（危险区），各模块可展开折叠。
 */
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Companion } from "@/hooks/useCompanion";
import { fetchModels, testConnection } from "@/lib/llm";
import type { ThinkingLevel } from "@/lib/db";
import { buildBackup, downloadBackup, importBackup } from "./backup";
import { deletePreset, listPresets, matchPreset, savePreset, type ApiPreset } from "./presets";
import { THINKING_OPTIONS } from "./thinking";
import { Section } from "./Section";
import { LockSettings } from "../lock/LockSettings";
import { ModelConnections } from "./ModelConnections";
import { ImageGenSection } from "./ImageGenSection";
import { CacheSection } from "./CacheSection";
import { BodySection } from "./BodySection";
import { VoiceSection } from "./VoiceSection";
import { EMBED_PROVIDERS, testEmbedConnection } from "../latent/embedProviders";
import { resetEmbedFailure } from "../latent/embed";

type ConnState = { testing: boolean; ok?: boolean; message?: string };

export function SettingsPanel({ c }: { c: Companion }) {
  const [form, setForm] = useState(c.settings);
  const [saved, setSaved] = useState(false);
  const [conn, setConn] = useState<ConnState>({ testing: false });
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputCls = "underline-input h-9 text-[15px] font-light focus-visible:ring-0";

  /* ---------- API 预设 ---------- */
  const [presets, setPresets] = useState<ApiPreset[]>(() => listPresets());
  const [presetName, setPresetName] = useState("");
  const activePreset = matchPreset(presets, form);

  const applyPreset = (id: string) => {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    setForm((f) => ({ ...f, apiKey: p.apiKey, baseUrl: p.baseUrl, model: p.model }));
    setModels(null);
  };

  const saveAsPreset = () => {
    const name = presetName.trim();
    if (!name) return;
    if (!form.apiKey.trim()) {
      setConn({ testing: false, ok: false, message: "先填 API Key 再保存预设" });
      return;
    }
    savePreset({ name, apiKey: form.apiKey, baseUrl: form.baseUrl, model: form.model });
    setPresets(listPresets());
    setPresetName("");
  };

  const removePreset = (id: string) => {
    deletePreset(id);
    setPresets(listPresets());
  };

  /* ---------- 请求思维链总开关（关闭时记住上次档位） ---------- */
  const [lastLevel, setLastLevel] = useState<ThinkingLevel>("medium");
  const thinkingOn = form.thinkingLevel !== "off";
  const toggleThinking = (v: boolean) => {
    if (!v) setLastLevel(form.thinkingLevel === "off" ? "medium" : form.thinkingLevel);
    setForm((f) => ({ ...f, thinkingLevel: v ? lastLevel : "off" }));
  };

  /* ---------- 拉取模型 ---------- */
  const [models, setModels] = useState<string[] | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);

  const pullModels = async () => {
    if (!form.apiKey.trim()) {
      setPullMsg("先填 API Key 再拉取");
      return;
    }
    setPulling(true);
    setPullMsg(null);
    try {
      const ids = await fetchModels(form.baseUrl.trim(), form.apiKey.trim());
      setModels(ids);
      setForm((f) => ({ ...f, model: ids.includes(f.model.trim()) ? f.model : ids[0] }));
      setPullMsg(`已拉取 ${ids.length} 个模型 ✓`);
    } catch (e) {
      setModels(null);
      setPullMsg(`拉取失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setPulling(false);
    }
  };

  /* ---------- embedding：服务商预设 / 拉取 / 测试（留空沿用聊天配置） ---------- */
  const [embedConn, setEmbedConn] = useState<ConnState>({ testing: false });
  const [embedModels, setEmbedModels] = useState<string[] | null>(null);
  const [embedPulling, setEmbedPulling] = useState(false);
  const [embedPullMsg, setEmbedPullMsg] = useState<string | null>(null);
  const effEmbedBase = form.embedBaseUrl.trim() || form.baseUrl.trim();
  const effEmbedKey = form.embedApiKey.trim() || form.apiKey.trim();
  const activeEmbedProvider = EMBED_PROVIDERS.find((p) => p.baseUrl === form.embedBaseUrl.trim());

  const applyEmbedProvider = (id: string) => {
    const p = EMBED_PROVIDERS.find((x) => x.id === id);
    if (!p) return;
    setForm((f) => ({ ...f, embedBaseUrl: p.baseUrl, embedModel: p.model }));
    setEmbedModels(null);
    setEmbedPullMsg(null);
  };

  const pullEmbedModels = async () => {
    if (!effEmbedKey) {
      setEmbedPullMsg("先填密钥（或沿用聊天的 Key）再拉取");
      return;
    }
    setEmbedPulling(true);
    setEmbedPullMsg(null);
    try {
      const ids = await fetchModels(effEmbedBase, effEmbedKey);
      // 尽量只留 embedding 类模型；服务商 /models 混排聊天模型时避免误选
      const embedish = ids.filter((id) => /embed|bge|e5|m3|jina|nomic|clip|doubao|v3/i.test(id));
      const list = embedish.length > 0 ? embedish : ids;
      setEmbedModels(list);
      setForm((f) => ({ ...f, embedModel: list.includes(f.embedModel.trim()) ? f.embedModel : list[0] }));
      setEmbedPullMsg(`已拉取 ${list.length} 个模型 ✓`);
    } catch (e) {
      setEmbedModels(null);
      setEmbedPullMsg(`拉取失败：${e instanceof Error ? e.message : e}`);
    } finally {
      setEmbedPulling(false);
    }
  };

  const testEmbed = async () => {
    if (!effEmbedKey) {
      setEmbedConn({ testing: false, ok: false, message: "先填密钥（或沿用聊天的 Key）再测试" });
      return;
    }
    setEmbedConn({ testing: true });
    const r = await testEmbedConnection(effEmbedBase, effEmbedKey, form.embedModel.trim() || "bge-m3");
    if (r.ok) resetEmbedFailure(); // 成功后解除本会话「云端不可用」闩锁
    setEmbedConn({ testing: false, ...r });
  };

  /* ---------- 保存 / 测试 / 备份 ---------- */
  const save = () => {
    c.updateSettings({
      ...form,
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey.trim(),
      model: form.model.trim() || "gpt-4o-mini",
      embedBaseUrl: form.embedBaseUrl.trim(),
      embedApiKey: form.embedApiKey.trim(),
      embedModel: form.embedModel.trim() || "bge-m3",
      summaryBaseUrl: form.summaryBaseUrl.trim(),
      summaryApiKey: form.summaryApiKey.trim(),
      summaryModel: form.summaryModel.trim(),
      imageBaseUrl: form.imageBaseUrl.trim(),
      imageApiKey: form.imageApiKey.trim(),
      imageModel: form.imageModel.trim(),
      imageSize: form.imageSize.trim() || "1024x1024",
      imageQuality: form.imageQuality.trim() || "auto",
      imagePositive: form.imagePositive.trim(),
      imageNegative: form.imageNegative.trim(),
      visionBaseUrl: form.visionBaseUrl.trim(),
      visionApiKey: form.visionApiKey.trim(),
      visionModel: form.visionModel.trim(),
      userPersona: form.userPersona.trim(),
      temperature: Math.max(0, Math.min(2, Number(form.temperature) || 0)),
      summarizeInterval: Math.max(5, Math.min(200, Number(form.summarizeInterval) || 20)),
    });
    setConn({ testing: false });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  const test = async () => {
    if (!form.apiKey.trim()) {
      setConn({ testing: false, ok: false, message: "先填 API Key 再测试" });
      return;
    }
    setConn({ testing: true });
    const r = await testConnection(form.baseUrl.trim(), form.apiKey.trim());
    setConn({ testing: false, ...r });
  };

  const doExport = async () => {
    setBusy("export");
    try {
      downloadBackup(await buildBackup());
    } finally {
      setBusy(null);
    }
  };

  const doImport = async (file: File) => {
    setBusy("import");
    try {
      const r = await importBackup(file);
      alert(`已恢复 ${r.messages} 条消息、${r.memories} 条记忆，点击确定后刷新页面`);
      window.location.reload();
    } catch (e) {
      alert(e instanceof Error ? e.message : "导入失败");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="chat-scroll h-full overflow-y-auto px-5 py-6">
      <div className="mx-auto max-w-lg space-y-5">
        {/* API 连接 */}
        <Section zh="连接你的模型服务" fr="Paramètres" defaultOpen>
          {/* 预设：命名保存、一键切换 */}
          <div className="space-y-1">
            <Label className="text-[13px] font-normal text-black/70">API 预设</Label>
            {presets.length > 0 && (
              <select
                value={activePreset?.id ?? ""}
                onChange={(e) => applyPreset(e.target.value)}
                className={`${inputCls} w-full bg-transparent`}
              >
                <option value="">— 选择预设 —</option>
                {presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-2">
              <Input
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="预设名，如：官方 GPT / 中转站"
                className={inputCls}
              />
              <Button
                onClick={saveAsPreset}
                disabled={!presetName.trim()}
                variant="secondary"
                className="glass h-9 shrink-0 rounded-full px-4 text-[13px] font-normal text-black/70 hover:bg-white/70"
              >
                保存
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <p className="font-caption mt-1 text-[12px] leading-relaxed text-black/40">
                — 把当前的 Key / 地址 / 模型存成预设，随时一键切换；只存本浏览器，不进备份
              </p>
              {activePreset && (
                <button
                  onClick={() => removePreset(activePreset.id)}
                  className="shrink-0 text-[12px] text-rose/80 transition-colors hover:text-rose"
                >
                  删除
                </button>
              )}
            </div>
          </div>

          <div className="hairline-b my-4" />

          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-[13px] font-normal text-black/70">API Key</Label>
              <Input type="password" value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))} placeholder="sk-..." className={inputCls} />
            </div>
            <div className="space-y-1">
              <Label className="text-[13px] font-normal text-black/70">Base URL（OpenAI 兼容）</Label>
              <Input value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))} placeholder="https://api.openai.com/v1" className={inputCls} />
            </div>
            <div className="space-y-1">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="text-[13px] font-normal text-black/70">模型</Label>
                  <Input value={form.model} onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))} placeholder="gpt-4o-mini" className={inputCls} />
                </div>
                <Button
                  onClick={pullModels}
                  disabled={pulling}
                  variant="secondary"
                  className="glass h-9 shrink-0 rounded-full px-4 text-[13px] font-normal text-black/70 hover:bg-white/70"
                >
                  {pulling ? "拉取中…" : "拉取模型"}
                </Button>
              </div>
              {models && (
                <select
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  className={`${inputCls} w-full bg-transparent`}
                >
                  {models.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              )}
              {pullMsg && <p className={`font-caption text-[12px] ${pullMsg.includes("失败") || pullMsg.includes("先填") ? "text-rose/80" : "text-emerald-800/80"}`}>{pullMsg}</p>}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Button
              onClick={test}
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

          <p className="font-caption mt-4 rounded-2xl bg-black/[0.04] px-3 py-2 text-[12.5px] leading-relaxed text-black/50">
            la clé ne vit que dans ce navigateur — 纯前端方案只适合自用；公开部署请加后端代理，否则 Key 会被访客看到。
          </p>

          {/* 总结 / 识图：独立连接配置（留空沿用聊天）；生图是独立模块，见下方 Section */}
          <ModelConnections form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
        </Section>

        {/* 生图：独立模块（API 链接 + 生图设置 + 测试生图） */}
        <ImageGenSection form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />

        <VoiceSection form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />
        {/* 提示词缓存：稳定前缀 / 工具 schema 的 provider 端缓存 + 本地观测日志（Cove 笔记） */}
        <CacheSection form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />

        <BodySection form={form} onChange={(patch) => setForm((f) => ({ ...f, ...patch }))} />

        {/* 双方思考：显示双方内心旁白 */}
        <Section zh="双方思考" fr="Pensées">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">显示双方的内心旁白：你的附言状态（未读可改/已读锁定）和 TA 的 [[THOUGHT:]] 旁白</p>
            <Switch checked={form.showThought} onCheckedChange={(v) => setForm((f) => ({ ...f, showThought: v }))} />
          </div>
          <p className="font-caption mt-2 text-[12.5px] leading-relaxed text-black/45">
            — 关闭只隐藏界面，不删数据，也不禁止 TA 读取附言；TA 读不读、什么时候读，由 TA 自己决定
          </p>
        </Section>

        {/* 关于你：用户人设，注入每次请求的系统提示词 */}
        <Section zh="关于你" fr="Toi">
          <div className="space-y-1">
            <Label className="text-[13px] font-normal text-black/70">你的人设</Label>
            <Textarea
              value={form.userPersona}
              onChange={(e) => setForm((f) => ({ ...f, userPersona: e.target.value }))}
              rows={3}
              placeholder="你是谁、在做什么、希望 TA 怎么对你…例如：我是一个经常熬夜的设计师，容易焦虑，希望被温柔地管着早睡。"
              className="min-h-[88px] w-full rounded-2xl border-0 bg-black/[0.04] px-4 py-3 text-[13.5px] font-light leading-relaxed text-[#262626] placeholder:text-black/30 focus-visible:ring-1 focus-visible:ring-black/15"
            />
            <p className="font-caption mt-1.5 text-[12px] text-black/40">
              — 会注入每次对话的系统提示词，TA 把它当作关于你的已知背景；留空则不注入
            </p>
          </div>
        </Section>

        {/* 思维链：总开关 + 强度档位 */}
        <Section zh="思维链（推理模式）" fr="Pensée">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">请求思维链</p>
            <Switch checked={thinkingOn} onCheckedChange={toggleThinking} />
          </div>
          <p className="font-caption mt-2 text-[12.5px] leading-relaxed text-black/45">
            — 发送 thinking 字段并透传思考预算；仅当中转/服务商透传思维内容时有效
          </p>
          {thinkingOn && (
            <>
              <div className="mt-4 divide-y divide-black/[0.07] overflow-hidden rounded-2xl border border-black/[0.09] bg-white/30">
                {THINKING_OPTIONS.filter((o) => o.id !== "off").map((o) => (
                  <button
                    key={o.id}
                    onClick={() => setForm((f) => ({ ...f, thinkingLevel: o.id }))}
                    className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-white/40"
                  >
                    <span
                      className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[10px] transition-colors ${
                        form.thinkingLevel === o.id ? "border-[#2b2b2b] bg-[#2b2b2b] text-white" : "border-black/25 text-transparent"
                      }`}
                    >
                      ✓
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-normal text-[#2b2b2b]">{o.zh}</span>
                      <span className="font-caption block text-[12px] leading-snug text-black/45">{o.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              {form.thinkingLevel === "custom" && (
                <p className="font-caption mt-2 text-[12px] text-black/45">— 具体预算数值在下方「Génération · 生成参数」里填写</p>
              )}
            </>
          )}
          <div className="hairline-b mt-4 pb-4" />
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">在气泡上方显示思考过程</p>
            <Switch
              checked={form.showThinking}
              onCheckedChange={(v) => setForm((f) => ({ ...f, showThinking: v }))}
            />
          </div>
          <p className="font-caption mt-3 rounded-2xl bg-black/[0.04] px-3 py-2 text-[12.5px] leading-relaxed text-black/50">
            ⚠ Anthropic 官方 OpenAI 兼容端点不回传思维内容（需中转以 reasoning_content 透传，或走原生 Messages
            API）。Claude 4.6+/5 代请改用「不设限」档；Kimi K2.6 / GLM-5.1 等推理模型会要求回传思维字段，App
            已自动处理。
          </p>
        </Section>

        {/* 生成参数 + 思考预算 */}
        <Section zh="生成参数与思考预算" fr="Génération">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">流式输出</p>
            <Switch
              checked={form.streamOutput}
              onCheckedChange={(v) => setForm((f) => ({ ...f, streamOutput: v }))}
            />
          </div>
          <p className="font-caption mt-2 text-[12.5px] leading-relaxed text-black/45">
            — 开启时逐字显示回复；关闭后等待整段生成完成再一次性显示
          </p>
          <div className="hairline-b my-4" />
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">模型温度</p>
            <span className="font-caption text-[13px] text-black/50">{Number(form.temperature).toFixed(2)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={form.temperature}
            onChange={(e) => setForm((f) => ({ ...f, temperature: Number(e.target.value) }))}
            className="mt-2 w-full accent-[#2b2b2b]"
            aria-label="模型温度"
          />
          <p className="font-caption mt-2 text-[12.5px] leading-relaxed text-black/45">
            — 越低越稳定，越高越发散（0~2），思维链模式下也按此温度发送；部分服务商在思维链时要求 1.0，如遇报错请调到 1.0
          </p>
          <div className="hairline-b my-4" />
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">图片识别（vision）</p>
            <Switch
              checked={form.enableVision}
              onCheckedChange={(v) => setForm((f) => ({ ...f, enableVision: v }))}
            />
          </div>
          <p className="font-caption mt-2 text-[12.5px] leading-relaxed text-black/45">
            — 开启后聊天输入栏的 ✦ 可发送图片（模型需支持 vision）；关闭时图片只以文字标注发给模型
          </p>
          {form.thinkingLevel === "custom" && (
            <>
              <div className="hairline-b my-4" />
              <div className="flex items-center gap-2 text-[13px] text-black/60">
                思考预算
                <Input
                  type="number"
                  min={1024}
                  step={1024}
                  value={form.thinkingBudget}
                  onChange={(e) => setForm((f) => ({ ...f, thinkingBudget: Number(e.target.value) }))}
                  className={`${inputCls} h-8 w-24 text-center`}
                />
                tokens
              </div>
            </>
          )}
        </Section>

        {/* 自动整理 */}
        <Section zh="记忆系统" fr="Souvenir">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">聊到相关旧事时自动浮现进上下文（显影 · 自动浮现）</p>
            <Switch checked={form.passiveRecall} onCheckedChange={(v) => setForm((f) => ({ ...f, passiveRecall: v }))} />
          </div>
          <div className="hairline-b my-4" />
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">久别重逢时带回上次的话和未完的事（显影 · 换窗召回）</p>
            <Switch checked={form.latentRecall} onCheckedChange={(v) => setForm((f) => ({ ...f, latentRecall: v }))} />
          </div>
          <div className="hairline-b my-4" />
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">latent_ 记忆工具：TA 能主动检索、记下和更正记忆（模型需支持工具调用，不支持时自动降级为注入模式）</p>
            <Switch checked={form.latentTools} onCheckedChange={(v) => setForm((f) => ({ ...f, latentTools: v }))} />
          </div>
          <div className="hairline-b my-4" />
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">事实模式：自动浮现改用事实簿（一句一条事实），替代块路径</p>
            <Switch checked={form.factMode} onCheckedChange={(v) => setForm((f) => ({ ...f, factMode: v }))} />
          </div>
          <div className="hairline-b my-4" />
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">云端 embedding：语义检索走独立配置的 /embeddings，地址和密钥可单独填（留空沿用聊天配置）；关闭则用零依赖 bigram</p>
            <Switch checked={form.embeddings} onCheckedChange={(v) => setForm((f) => ({ ...f, embeddings: v }))} />
          </div>
          {form.embeddings && (
            <div className="mt-3 space-y-3">
              {/* 服务商预设：官方 / 第三方 */}
              <div className="space-y-1.5">
                <Label className="text-[13px] font-normal text-black/70">服务商预设</Label>
                <div className="flex flex-wrap gap-1.5">
                  {EMBED_PROVIDERS.map((p) => {
                    const active = activeEmbedProvider?.id === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyEmbedProvider(p.id)}
                        className={`glass rounded-full px-3 py-1 text-[12px] tracking-wide transition-all ${
                          active ? "text-[#1f1f1f] ring-1 ring-black/25" : "text-black/50 hover:text-black/75"
                        }`}
                      >
                        {p.kind === "official" ? "◆ " : ""}
                        {p.name}
                      </button>
                    );
                  })}
                </div>
                {activeEmbedProvider?.hint && (
                  <p className="font-caption text-[12px] text-black/40">{activeEmbedProvider.hint}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-[13px] font-normal text-black/70">API 地址（留空沿用聊天）</Label>
                <Input
                  value={form.embedBaseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, embedBaseUrl: e.target.value }))}
                  placeholder="https://api.openai.com/v1"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[13px] font-normal text-black/70">API 密钥（留空沿用聊天）</Label>
                <Input
                  type="password"
                  value={form.embedApiKey}
                  onChange={(e) => setForm((f) => ({ ...f, embedApiKey: e.target.value }))}
                  placeholder="sk-…"
                  className={inputCls}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[13px] font-normal text-black/70">embedding 模型</Label>
                <div className="flex items-center gap-2">
                  <Input
                    value={form.embedModel}
                    onChange={(e) => setForm((f) => ({ ...f, embedModel: e.target.value }))}
                    placeholder="bge-m3"
                    className={inputCls}
                  />
                  <Button
                    onClick={pullEmbedModels}
                    disabled={embedPulling}
                    variant="secondary"
                    className="glass h-9 shrink-0 rounded-full px-4 text-[13px] font-normal text-black/70 hover:bg-white/70"
                  >
                    {embedPulling ? "拉取中…" : "拉取模型"}
                  </Button>
                </div>
                {embedModels && (
                  <select
                    value={form.embedModel}
                    onChange={(e) => setForm((f) => ({ ...f, embedModel: e.target.value }))}
                    className={`${inputCls} w-full bg-transparent`}
                  >
                    {embedModels.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                )}
                {embedPullMsg && (
                  <p className={`font-caption text-[12px] ${embedPullMsg.includes("失败") || embedPullMsg.includes("先填") ? "text-rose/80" : "text-emerald-800/80"}`}>
                    {embedPullMsg}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={testEmbed}
                  disabled={embedConn.testing}
                  variant="secondary"
                  className="glass h-9 rounded-full px-4 text-[13px] font-normal text-black/70 hover:bg-white/70"
                >
                  {embedConn.testing ? "测试中…" : "测试连接"}
                </Button>
                {embedConn.message && (
                  <span className={`text-[12px] ${embedConn.ok ? "text-emerald-800/80" : "text-rose"}`}>{embedConn.message}</span>
                )}
              </div>
            </div>
          )}
          <div className="hairline-b my-4" />
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">山屋：记忆的可视化小屋页面（开在「记忆」Tab 里切换）</p>
            <Switch checked={form.hutEnabled} onCheckedChange={(v) => setForm((f) => ({ ...f, hutEnabled: v }))} />
          </div>
          <div className="hairline-b my-4" />
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-normal text-black/60">聊天达到间隔后，自动用 AI 整理记忆</p>
            <Switch checked={form.autoSummarize} onCheckedChange={(v) => setForm((f) => ({ ...f, autoSummarize: v }))} />
          </div>
          {form.autoSummarize && (
            <div className="mt-3 flex items-center gap-2 text-[13px] text-black/60">
              每
              <Input
                type="number"
                min={5}
                max={200}
                value={form.summarizeInterval}
                onChange={(e) => setForm((f) => ({ ...f, summarizeInterval: Number(e.target.value) }))}
                className={`${inputCls} h-8 w-16 text-center`}
              />
              条消息整理一次
            </div>
          )}
        </Section>

        {/* 门锁与口令 */}
        <LockSettings lockEnabled={form.lockEnabled} onToggle={(v) => setForm((f) => ({ ...f, lockEnabled: v }))} />

        {/* 备份 */}
        <Section zh="备份与恢复" fr="Sauvegarde">
          <p className="font-caption mb-3 text-[13px] text-black/45">— 包含角色卡、聊天、记忆，不含 API Key 与预设</p>
          <div className="flex gap-2">
            <Button onClick={doExport} disabled={busy !== null} variant="secondary" className="glass h-10 flex-1 rounded-full text-[13px] font-normal text-black/70 hover:bg-white/70">
              {busy === "export" ? "导出中…" : "导出备份"}
            </Button>
            <Button onClick={() => fileRef.current?.click()} disabled={busy !== null} variant="secondary" className="glass h-10 flex-1 rounded-full text-[13px] font-normal text-black/70 hover:bg-white/70">
              {busy === "import" ? "恢复中…" : "导入备份"}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void doImport(f);
              }}
            />
          </div>
        </Section>

        {/* 危险区：两种清空 */}
        <Section zh="危险操作，请谨慎" fr="Danger">
          <button onClick={() => void c.clearChat()} className="hairline-b block w-full py-3 text-left">
            <div className="text-[16px] font-light text-[#2b2b2b]">清空聊天记录</div>
            <div className="font-caption mt-0.5 text-[12px] text-black/40">— réinitialiser · 保留记忆，从头开始聊</div>
          </button>
          <button onClick={() => void c.clearAll()} className="block w-full py-3 text-left">
            <div className="text-[16px] font-light text-rose">清空聊天记录和记忆</div>
            <div className="font-caption mt-0.5 text-[12px] text-black/40">— tout effacer · 彻底清空，包括关于你的一切记忆</div>
          </button>
        </Section>

        {/* 保存设置（最下方） */}
        <Button onClick={save} className="h-12 w-full rounded-full bg-[#2b2b2b] text-[15px] font-normal tracking-widest text-white hover:bg-black">
          {saved ? "已保存 ✓" : "保存设置"}
        </Button>

        <p className="font-caption pb-4 text-center text-[13px] text-black/40">☾ ✦ n'oublie pas de sauvegarder</p>
      </div>
    </div>
  );
}

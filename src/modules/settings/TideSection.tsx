/**
 * settings/TideSection.tsx — 设置里的「心潮引擎」模块（独立 Section）
 * 服务地址 + 访问令牌 + 轮询间隔 + 测试连接。
 * 与模型的 OpenAI 兼容连接不同，心潮走自己的 dashboard 会话接口，
 * 因此不复用 ConnFields，单独一个轻量表单。
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { Settings } from "@/lib/db";
import { Section } from "./Section";
import { normalizeTideBase, testTideConnection } from "../tide/client";

type ConnState = { testing: boolean; ok?: boolean; message?: string };

export function TideSection({
  form,
  onChange,
}: {
  form: Settings;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const [conn, setConn] = useState<ConnState>({ testing: false });
  const configured = form.xinchaoBaseUrl.trim() !== "" && form.xinchaoToken.trim() !== "";

  const doTest = async () => {
    setConn({ testing: true });
    const r = await testTideConnection(form.xinchaoBaseUrl, form.xinchaoToken);
    setConn({ testing: false, ...r });
  };

  return (
    <Section zh="心潮引擎（动态心念）" fr="Marée">
      <p className="text-[13px] font-normal leading-relaxed text-black/60">
        接入心潮·念 动态心念引擎后，底部「心潮」板块将实时呈现 TA 的驱力潮位、心绪痕迹、
        信号与梦境余韵（数据在远端引擎，令牌只存本机）
      </p>

      <div className="mt-4 space-y-3.5">
        <div>
          <div className="font-caption text-[12px] text-black/50">服务地址</div>
          <Input
            value={form.xinchaoBaseUrl}
            onChange={(e) => onChange({ xinchaoBaseUrl: e.target.value })}
            placeholder="例如 https://your-host:7100"
            className="underline-input mt-1.5 h-9 text-[15px] font-light focus-visible:ring-0"
          />
        </div>
        <div>
          <div className="font-caption text-[12px] text-black/50">访问令牌（DASHBOARD_ACCESS_TOKEN）</div>
          <Input
            type="password"
            value={form.xinchaoToken}
            onChange={(e) => onChange({ xinchaoToken: e.target.value })}
            placeholder="心潮服务端 .env 里的 dashboard 令牌"
            className="underline-input mt-1.5 h-9 text-[15px] font-light focus-visible:ring-0"
          />
        </div>
        <div>
          <div className="font-caption text-[12px] text-black/50">轮询间隔（秒）</div>
          <Input
            type="number"
            min={10}
            max={600}
            value={form.xinchaoPollSec || 30}
            onChange={(e) => {
              const n = Math.max(10, Math.min(600, Math.floor(Number(e.target.value) || 30)));
              onChange({ xinchaoPollSec: n });
            }}
            className="underline-input mt-1.5 h-9 text-[15px] font-light focus-visible:ring-0"
          />
          <p className="font-caption mt-1.5 text-[11px] italic leading-relaxed text-black/35">
            心潮面板打开时每隔这么久同步一次，面板关闭即停
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={doTest}
            disabled={conn.testing || !configured}
            className="rounded-full border border-black/15 bg-black/[0.06] px-4 py-1.5 text-[12px] text-black/60 transition-colors hover:text-black/85 disabled:opacity-40"
          >
            {conn.testing ? "测试中…" : "测试连接"}
          </button>
          {conn.message && (
            <span className={`font-caption text-[12px] italic ${conn.ok ? "text-black/60" : "text-black/50"}`}>
              {conn.message}
            </span>
          )}
        </div>
      </div>

      <div className="hairline-b my-4" />
      <p className="font-caption text-[12px] italic leading-relaxed text-black/40">
        跨域直连需要心潮服务端放行本页来源：在引擎 .env 的 DASHBOARD_ALLOWED_ORIGINS 中加入
        本 PWA 的地址（如 http://localhost:4173 或部署后的 Pages 域名），重启引擎后生效；
        当前生效地址 · {normalizeTideBase(form.xinchaoBaseUrl) || "未配置"}
      </p>
    </Section>
  );
}

/**
 * body/api.ts — 生理系统的独立模型连接配置
 *
 * 面板 / 设置里可单独填写生理板块的 API 地址、密钥、模型；
 * 任一项留空自动回落到主模型连接（baseUrl / apiKey / model），
 * 结算 / 梦境系统移植进来后直接取 resolveBodyApi() 发请求。
 * 服务商均为 OpenAI 兼容协议（/models + /chat/completions），官方与第三方同适配。
 */

import type { Settings } from "@/lib/db";

export interface BodyApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 生理系统实际生效的连接配置：逐项留空则默认主模型 */
export function resolveBodyApi(settings: Settings): BodyApiConfig {
  return {
    baseUrl: (settings.bodyBaseUrl ?? "").trim() || settings.baseUrl,
    apiKey: (settings.bodyApiKey ?? "").trim() || settings.apiKey,
    model: (settings.bodyModel ?? "").trim() || settings.model,
  };
}

/** 生理系统服务商预设（OpenAI 兼容，官方 + 第三方） */
export const BODY_PROVIDERS = [
  {
    id: "openai",
    name: "OpenAI 官方",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    hint: "官方接口，结算 / 梦境请求走 chat/completions",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    hint: "国内直连，OpenAI 兼容",
  },
  {
    id: "moonshot",
    name: "Moonshot Kimi",
    baseUrl: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-8k",
    hint: "国内直连，OpenAI 兼容",
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
    hint: "OpenAI 兼容 /models 与 /chat/completions",
  },
  {
    id: "siliconflow",
    name: "硅基流动",
    baseUrl: "https://api.siliconflow.cn/v1",
    model: "Qwen/Qwen2.5-7B-Instruct",
    hint: "聚合多家开源模型，按量计费",
  },
];

/** 生理端点测试：查 /models 是否开放 + 是否包含所配模型（不发真实结算请求） */
export async function testBodyEndpoint(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(baseUrl.replace(/\/+$/, "") + "/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return { ok: false, message: "Key 被拒绝（401/403），检查一下是否复制完整" };
      return { ok: false, message: `服务返回 ${res.status}，地址或服务状态有问题` };
    }
    const json = await res.json();
    const ids: string[] = Array.isArray(json?.data) ? json.data.map((d: { id?: string }) => d.id).filter(Boolean) : [];
    if (!model) return { ok: true, message: `连接成功 · 共 ${ids.length} 个模型，填入模型名即可` };
    if (ids.some((id) => id.toLowerCase() === model.toLowerCase())) {
      return { ok: true, message: `连接成功 · 已找到 ${model} ✓` };
    }
    return { ok: true, message: `连接成功 · 列表未见「${model}」，若代理不开放模型列表可忽略` };
  } catch (e) {
    return { ok: false, message: `网络请求失败：${e instanceof Error ? e.message : e}` };
  }
}

/**
 * settings/presets.ts — API 预设（命名保存、一键切换）
 * 一组「API Key + Base URL + 模型」保存为一个命名预设，方便在多家服务商之间切换。
 * 预设只存本浏览器 localStorage（和 settings 同一层级），绝不进备份文件、不进仓库。
 */

export interface ApiPreset {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  ts: number;
}

const PRESETS_KEY = "starling.apiPresets";

function readAll(): ApiPreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeAll(list: ApiPreset[]) {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
}

export function listPresets(): ApiPreset[] {
  return readAll().sort((a, b) => a.ts - b.ts);
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 保存预设：同名覆盖（更新 Key/地址/模型），否则新建 */
export function savePreset(draft: { name: string; apiKey: string; baseUrl: string; model: string }): ApiPreset {
  const name = draft.name.trim();
  const list = readAll();
  const existing = list.find((p) => p.name === name);
  const preset: ApiPreset = {
    id: existing?.id ?? uid(),
    name,
    apiKey: draft.apiKey.trim(),
    baseUrl: draft.baseUrl.trim(),
    model: draft.model.trim(),
    ts: Date.now(),
  };
  writeAll(existing ? list.map((p) => (p.id === preset.id ? preset : p)) : [...list, preset]);
  return preset;
}

export function deletePreset(id: string) {
  writeAll(readAll().filter((p) => p.id !== id));
}

/** 找出与当前表单内容一致的预设（用于下拉框回显） */
export function matchPreset(presets: ApiPreset[], s: { apiKey: string; baseUrl: string; model: string }): ApiPreset | undefined {
  return presets.find((p) => p.apiKey === s.apiKey.trim() && p.baseUrl === s.baseUrl.trim() && p.model === s.model.trim());
}

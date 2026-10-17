/**
 * settings/imagePresets.ts — 生图预设组（正面/负面词的组合命名保存）
 * 存 localStorage（跟随设备，不进备份文件——备份不携带任何 Key 与配置）。
 */

export interface ImagePreset {
  id: string;
  name: string;
  positive: string;
  negative: string;
}

const KEY = "starling.imagegen.presets";

function read(): ImagePreset[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(list: ImagePreset[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function listImagePresets(): ImagePreset[] {
  return read();
}

/** 同名覆盖（按名字保存，像截图里的「保存」语义） */
export function saveImagePreset(p: { name: string; positive: string; negative: string }): ImagePreset[] {
  const name = p.name.trim();
  if (!name) return read();
  const list = read();
  const hit = list.find((x) => x.name === name);
  if (hit) {
    hit.positive = p.positive;
    hit.negative = p.negative;
  } else {
    list.push({ id: newId(), name, positive: p.positive, negative: p.negative });
  }
  write(list);
  return read();
}

export function deleteImagePreset(id: string): ImagePreset[] {
  write(read().filter((x) => x.id !== id));
  return read();
}

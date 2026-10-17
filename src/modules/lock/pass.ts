/**
 * 门锁口令：独立 localStorage 键，不进设置备份、不进仓库。
 * 默认口令 111111，可在设置「Verrou · 门锁与口令」中修改。
 */
const PASS_KEY = "starling.lock.pass";
const DEFAULT_PASS = "111111";

export function getPass(): string {
  try {
    const p = localStorage.getItem(PASS_KEY);
    if (p && /^\d{6}$/.test(p)) return p;
  } catch {
    /* ignore */
  }
  return DEFAULT_PASS;
}

export function isPassDefault(): boolean {
  return getPass() === DEFAULT_PASS;
}

/** 校验六位数字；返回错误文案，null 表示通过 */
export function changePass(oldPass: string, newPass: string): string | null {
  if (oldPass !== getPass()) return "现在的口令不对";
  if (!/^\d{6}$/.test(newPass)) return "新口令需为 6 位数字";
  if (newPass === oldPass) return "新口令和现在的一样";
  try {
    localStorage.setItem(PASS_KEY, newPass);
  } catch {
    return "保存失败，请重试";
  }
  return null;
}

export function verifyPass(input: string): boolean {
  return input === getPass();
}

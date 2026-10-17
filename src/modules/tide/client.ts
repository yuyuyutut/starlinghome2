/**
 * tide/client.ts — 心潮·念 动态心念引擎 客户端（独立模块）
 *
 * 直连心潮服务端的 dashboard 投影接口，浏览器跨域使用 header 会话模式：
 *   会话：POST {base}/dashboard/session  { accessToken, mode:"header" } → { ok, token, expiresAt }
 *   数据：GET  {base}/dashboard/api/*     Authorization: Bearer <token>
 *
 * 前提（服务端 .env）：DASHBOARD_ALLOWED_ORIGINS 必须包含本 PWA 的来源，
 * 否则浏览器预检会被拒。会话令牌按 服务地址 缓存（内存 + localStorage），
 * 401 时自动重建会话并重试一次。
 */

export type TideDriveLevel = "quiet" | "present" | "rising" | "surging";

export interface TideDrive {
  key: string;
  label: string;
  short?: string;
  /** 0~1 */
  value: number;
  percent?: number;
  level?: TideDriveLevel;
}

export interface TideStamen {
  security: number;
  confidence: number;
  mood: number;
  baseline?: number;
}

export interface TideEmotionMark {
  at?: string;
  label?: string;
  valence?: number;
  arousal?: number;
  note?: string;
  [k: string]: unknown;
}

export interface TideEmotion {
  summary?: Record<string, unknown> | null;
  journal?: unknown[];
  days?: number;
  marks?: TideEmotionMark[];
  [k: string]: unknown;
}

export interface TideSignal {
  kind?: string;
  subject?: string;
  text?: string;
  at?: string;
}

export interface TideDream {
  id: string;
  createdAt?: string;
  source?: string;
  hasDream?: boolean;
  hasResidue?: boolean;
  hasSummary?: boolean;
  hasAwareness?: boolean;
  lucidity?: number;
  mood?: { valence?: number; arousal?: number };
}

export interface TideMixed {
  id: string;
  name: string;
  since?: string;
}

export interface TidePersonality {
  available?: boolean;
  constellation?: string;
  month?: string;
  anchors?: { key: string; label: string; addedAt?: string }[];
  dimensions?: { key: string; label: string; score: number; delta?: number }[];
}

export interface TideRuntime {
  mode?: string;
  consciousness?: number;
  fatigue?: number;
  lastConversationAt?: string | null;
  lastHeartbeatAt?: string | null;
  lastSettledAt?: string | null;
  idleMinutes?: number;
  activeSessions?: number;
}

export interface TideIdentity {
  agentName?: string;
  recipient?: string;
}

export interface TideSnapshot {
  schemaVersion: number;
  system?: string;
  generatedAt?: string;
  revision?: number;
  identity?: TideIdentity;
  runtime?: TideRuntime;
  drives: TideDrive[];
  topDrives?: TideDrive[];
  stamen?: TideStamen;
  emotion?: TideEmotion;
  mixed?: TideMixed | null;
  personality?: TidePersonality;
  awareness?: unknown;
  signals?: { last24h?: number; recent?: TideSignal[] };
  thoughts?: { flashCount?: number; obsessionCount?: number; signals?: unknown; lines?: unknown };
  dreams?: TideDream[];
  [k: string]: unknown;
}

/** 规范化服务地址：补协议、去尾部斜杠 */
export function normalizeTideBase(raw: string): string {
  let s = raw.trim().replace(/\/+$/, "");
  if (s && !/^https?:\/\//i.test(s)) s = "http://" + s;
  return s;
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/+$/, "") + path;
}

/* ---------------- 会话令牌缓存 ---------------- */

interface SessionInfo {
  token: string;
  expiresAt: number;
}

const sessionCache = new Map<string, SessionInfo>();
const storeKey = (base: string) => `xinchao.session.${base}`;

async function createSession(base: string, accessToken: string): Promise<SessionInfo> {
  const res = await fetch(joinUrl(base, "/dashboard/session"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken, mode: "header" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; token?: string; expiresAt?: number | string; error?: { message?: string } }
    | null;
  if (!data || !data.ok || !data.token) {
    throw new Error(data?.error?.message || "心潮服务端拒绝了会话请求（检查访问令牌）");
  }
  return { token: data.token, expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : Date.now() + 12 * 3600_000 };
}

async function getSession(base: string, accessToken: string, force = false): Promise<SessionInfo> {
  const key = storeKey(base);
  if (!force) {
    const mem = sessionCache.get(key);
    if (mem && mem.expiresAt - 60_000 > Date.now()) return mem;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const s = JSON.parse(raw) as SessionInfo;
        if (s.token && s.expiresAt - 60_000 > Date.now()) {
          sessionCache.set(key, s);
          return s;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const s = await createSession(base, accessToken);
  sessionCache.set(key, s);
  try {
    localStorage.setItem(key, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  return s;
}

function dropSession(base: string) {
  sessionCache.delete(storeKey(base));
  try {
    localStorage.removeItem(storeKey(base));
  } catch {
    /* ignore */
  }
}

async function tideFetch(base: string, accessToken: string, path: string): Promise<unknown> {
  let s = await getSession(base, accessToken);
  let res = await fetch(joinUrl(base, path), { headers: { Authorization: `Bearer ${s.token}` } });
  if (res.status === 401) {
    // 会话过期：强制重建一次再试
    dropSession(base);
    s = await getSession(base, accessToken, true);
    res = await fetch(joinUrl(base, path), { headers: { Authorization: `Bearer ${s.token}` } });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json().catch(() => null);
}

/* ---------------- 对外 API ---------------- */

/** 拉取心潮快照（驱力 / 心绪 / 信号 / 梦境 / 人格 等全量投影） */
export async function fetchTideSnapshot(base: string, accessToken: string): Promise<TideSnapshot> {
  const snap = (await tideFetch(base, accessToken, "/dashboard/api/snapshot")) as TideSnapshot | null;
  if (!snap || typeof snap.schemaVersion !== "number" || !Array.isArray(snap.drives)) {
    throw new Error("返回的不是心潮快照（schema 不符）");
  }
  return snap;
}

/** 测试连接：只建立会话，不拉数据 */
export async function testTideConnection(
  baseUrl: string,
  accessToken: string
): Promise<{ ok: boolean; message: string }> {
  const base = normalizeTideBase(baseUrl);
  if (!base) return { ok: false, message: "先填服务地址" };
  if (!accessToken.trim()) return { ok: false, message: "先填访问令牌" };
  try {
    const s = await createSession(base, accessToken.trim());
    sessionCache.set(storeKey(base), s);
    try {
      localStorage.setItem(storeKey(base), JSON.stringify(s));
    } catch {
      /* ignore */
    }
    return { ok: true, message: "连接成功 · 会话已建立 ✓" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      return { ok: false, message: "网络请求失败：服务端不可达，或来源未被 DASHBOARD_ALLOWED_ORIGINS 放行" };
    }
    return { ok: false, message: msg };
  }
}

/** 驱力档位的中文标注 */
export const DRIVE_LEVEL_ZH: Record<TideDriveLevel, string> = {
  quiet: "平静",
  present: "涌动",
  rising: "上涨",
  surging: "翻涌",
};

export function driveLevel(d: TideDrive): TideDriveLevel {
  if (d.level) return d.level;
  if (d.value >= 0.75) return "surging";
  if (d.value >= 0.5) return "rising";
  if (d.value >= 0.25) return "present";
  return "quiet";
}

/** 相对时间：x秒/分/小时/天前 */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小时前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  return new Date(t).toLocaleDateString("zh-CN");
}

/** 简短日期时间（梦境列表用） */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}

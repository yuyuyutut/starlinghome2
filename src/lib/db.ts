/**
 * db.ts — IndexedDB 轻量封装
 * 所有本地数据都存这里；settings 体积小且启动时要同步读，放 localStorage。
 *
 * 数据结构（要加新字段直接改这里，旧数据自动兼容）：
 *   characters: { id, name, avatar, personality, speakingStyle, relationship, background, firstMessage }
 *   messages:   { id, role: 'user'|'assistant', content, ts }
 *   memories:   { id, title, body, status, pinned, weight, hits, source, ts }（latent 记忆库记录）
 *   unresolved: { id, text, done, ts }          — 未解决清单
 *   threads:    { id, summary, openCount, closedAt } — 会话线索快照
 *   facts:      { id, memoryId, text, lastSurfacedAt } — 事实簿（一句一条）
 *   notes:      { id, text, reply }              — 山屋便条（只追加，TA 回）
 *   meta:       { key, value }  — 好感度、初次见面时间、上次访问时间等
 */

const DB_NAME = "starling-home";
const DB_VERSION = 3;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("characters")) db.createObjectStore("characters", { keyPath: "id" });
      if (!db.objectStoreNames.contains("messages")) db.createObjectStore("messages", { keyPath: "id" });
      if (!db.objectStoreNames.contains("memories")) db.createObjectStore("memories", { keyPath: "id" });
      if (!db.objectStoreNames.contains("unresolved")) db.createObjectStore("unresolved", { keyPath: "id" });
      if (!db.objectStoreNames.contains("threads")) db.createObjectStore("threads", { keyPath: "id" });
      if (!db.objectStoreNames.contains("facts")) db.createObjectStore("facts", { keyPath: "id" });
      if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

export const db = {
  get: <T>(store: string, key: string) => tx<T | undefined>(store, "readonly", (s) => s.get(key)),
  put: (store: string, value: unknown) => tx(store, "readwrite", (s) => s.put(value)),
  del: (store: string, key: string) => tx(store, "readwrite", (s) => s.delete(key)),
  all: <T>(store: string) => tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>),
  clear: (store: string) => tx(store, "readwrite", (s) => s.clear()),
};

/** meta 键值辅助 */
export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const row = await db.get<{ key: string; value: T }>("meta", key);
  return row ? row.value : fallback;
}
export async function setMeta(key: string, value: unknown) {
  await db.put("meta", { key, value });
}

/** 思考强度档位（见 settings/thinking.ts；off=不请求思维链，auto=不限制预算） */
export type ThinkingLevel = "off" | "auto" | "low" | "medium" | "high" | "max" | "custom";

/** settings — 放 localStorage，启动时同步可读 */
export interface Settings {
  apiKey: string;
  baseUrl: string;
  model: string;
  /** 模型温度 0~2（思维链开启时服务商多强制 1.0） */
  temperature: number;
  /** 流式输出：关闭后等待整段生成完成再一次性显示 */
  streamOutput: boolean;
  /** 图片识别（vision）：开启后聊天可发送图片，模型需支持 image_url */
  enableVision: boolean;
  /** 自动整理记忆开关 */
  autoSummarize: boolean;
  /** 每隔多少条消息自动整理一次 */
  summarizeInterval: number;
  /** 思考强度档位 */
  thinkingLevel: ThinkingLevel;
  /** 自定义档的思考预算（budget_tokens，最低 1024） */
  thinkingBudget: number;
  /** 在气泡上方显示思维过程 */
  showThinking: boolean;
  /** 开屏门锁：巴洛克大门 + 口令（口令本体另存于 starling.lock.pass，不进备份） */
  lockEnabled: boolean;
  /** 显影记忆：每轮按消息检索相关旧事，注入本次请求（Latent 自动浮现） */
  passiveRecall: boolean;
  /** 显影记忆：久别重逢时带回「上次聊到哪 + 未了的事」（Latent 换窗召回） */
  latentRecall: boolean;
  /** latent_ 记忆工具：挂载给模型主动检索/写回（服务商需支持 function calling） */
  latentTools: boolean;
  /** 事实模式：自动浮现完全改用事实簿（一句一条事实），替代块路径 */
  factMode: boolean;
  /** 云端 embedding：语义路用 {embedBaseUrl}/embeddings（留空则沿用聊天的地址与 Key） */
  embeddings: boolean;
  /** embedding 服务地址（留空 = 沿用 baseUrl） */
  embedBaseUrl: string;
  /** embedding 密钥（留空 = 沿用 apiKey） */
  embedApiKey: string;
  /** embedding 模型名（各家 /embeddings 通用形状） */
  embedModel: string;
  /** 山屋：记忆的可视化小屋页面（默认关，开在设置里） */
  hutEnabled: boolean;
  /** 总结模型：AI 整理记忆的独立配置（留空沿用聊天） */
  summaryBaseUrl: string;
  summaryApiKey: string;
  summaryModel: string;
  /** 生图模型：OpenAI 官方或第三方 /images/generations（留空沿用聊天） */
  imageBaseUrl: string;
  imageApiKey: string;
  imageModel: string;
  /** 生图设置：尺寸 / 质量 / 正负预设词（负面词对 OpenAI 系以 "Avoid: …" 附加到 prompt） */
  imageSize: string;
  imageQuality: string;
  imagePositive: string;
  imageNegative: string;
  /** 识图模型：聊天发图时的 vision 配置（留空沿用聊天） */
  visionBaseUrl: string;
  visionApiKey: string;
  visionModel: string;
  /** 用户人设：填进每次请求的系统提示词（你是谁、希望 TA 怎么对你），留空不注入 */
  userPersona: string;
  /** 双方思考：显示双方内心旁白（关闭只隐藏界面，不删数据、不禁止 TA 读取） */
  showThought: boolean;
  /** 提示词缓存：稳定 system 前缀与工具 schema 打 Anthropic 式 cache_control（默认关，观测日志见设置「提示词缓存」区块） */
  promptCache: boolean;
  /** 生理系统：随时间推进身体周期与七项数值，按触发表抽取短时事件 */
  bodyCycle: boolean;
  /** 生理系统：把 <ephemeral_state> 状态卡注入每轮请求（关闭仍 tick 与展示，只是不注入） */
  bodyInject: boolean;
  /** 生理系统：称呼 / 触发词（逗号分隔），命中可触发「声音 / 称呼触发」事件 */
  bodyTriggers: string;
  /** 生理系统：独立 API 链接（结算 / 梦境等生理专属请求用），留空默认主模型 */
  bodyBaseUrl: string;
  /** 生理系统：独立 API 密钥，留空沿用聊天 Key */
  bodyApiKey: string;
  /** 生理系统：独立模型名，留空沿用聊天模型 */
  bodyModel: string;
  /** 心潮引擎：心潮·念 动态心念服务地址（如 https://host:7100，留空则心潮板块为本地占位） */
  xinchaoBaseUrl: string;
  /** 心潮引擎：dashboard 访问令牌（DASHBOARD_ACCESS_TOKEN） */
  xinchaoToken: string;
  /** 心潮引擎：面板打开时的轮询间隔（秒，默认 30） */
  xinchaoPollSec: number;
}
const SETTINGS_KEY = "starling.settings";
const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  temperature: 0.8,
  streamOutput: true,
  enableVision: false,
  autoSummarize: false,
  summarizeInterval: 20,
  thinkingLevel: "auto",
  thinkingBudget: 2000,
  showThinking: true,
  lockEnabled: true,
  passiveRecall: true,
  latentRecall: true,
  latentTools: true,
  factMode: false,
  embeddings: false,
  embedBaseUrl: "",
  embedApiKey: "",
  embedModel: "bge-m3",
  hutEnabled: false,
  summaryBaseUrl: "",
  summaryApiKey: "",
  summaryModel: "",
  imageBaseUrl: "",
  imageApiKey: "",
  imageModel: "",
  imageSize: "1024x1024",
  imageQuality: "auto",
  imagePositive:
    "semi-realistic anime portrait, polished digital painting, painterly rendering, soft blended brushwork, smooth skin shading, refined facial features",
  imageNegative:
    "low quality, blurry, overexposed, oversaturated, harsh cel shading, sketchy lines, watercolor texture, thick lineart, rough brushstrokes, bad anatomy",
  visionBaseUrl: "",
  visionApiKey: "",
  visionModel: "",
  userPersona: "",
  showThought: true,
  promptCache: false,
  bodyCycle: true,
  bodyInject: true,
  bodyTriggers: "",
  bodyBaseUrl: "",
  bodyApiKey: "",
  bodyModel: "",
  xinchaoBaseUrl: "",
  xinchaoToken: "",
  xinchaoPollSec: 30,
};

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const stored = JSON.parse(raw);
      const merged = { ...DEFAULT_SETTINGS, ...stored };
      // 旧版本用 enableThinking 开关，迁移为档位制
      if (!stored.thinkingLevel) merged.thinkingLevel = stored.enableThinking ? "custom" : "off";
      return merged;
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_SETTINGS };
}
export function saveSettings(s: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

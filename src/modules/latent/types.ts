/**
 * latent/types.ts — 显影记忆系统的数据形状（四层数据模型）
 *
 * 设计移植自 oliscatt/Latent-memory（本地优先长期记忆）：
 *   · 记忆库：完整叙述 + 「当下状态」收尾（病灶迁移），配索引摘要
 *   · 用进废退：被检索命中的记忆权重上升，不做时间衰减
 *   · 变迁链：事实变化时不改旧记录，新建记录并双向挂链（supersede）
 *   · 撤回账本：记错的记录标记 corrected，任何检索不再返回
 *   · 未解决清单 / 会话线索：换窗召回时的优先内容
 */

/** 记忆来源：规则自动 / 手动 / LLM 总结 */
export type MemorySource = "auto" | "manual" | "llm";

/** 当下状态类别：仍有效 / 已变化（被取代）/ 已结束 */
export type StatusKind = "current" | "changed" | "closed";

/** 记忆库记录（替代旧平铺 MemoryItem；旧数据自动迁移） */
export interface MemoryRecord {
  id: string;
  /** 属于哪个聊天对象（角色） */
  charId?: string;
  /** 索引摘要（短标题，检索时权重最高） */
  title: string;
  /** 完整叙述（正文） */
  body: string;
  /** 当下状态——每条记录必须以此收尾（病灶迁移） */
  status: string;
  statusKind: StatusKind;
  /** 置顶常驻：进入「人格文件」层，每次请求都携带（里程碑） */
  pinned: boolean;
  /** 用进废退：被检索命中 +1，不做时间衰减 */
  weight: number;
  /** 累计命中次数 */
  hits: number;
  source: MemorySource;
  /** 登记时间 */
  ts: number;
  updatedAt: number;
  /** 变迁链：被哪条记录取代（旧 → 新） */
  supersededBy?: string;
  /** 变迁链：取代了哪条记录（新 → 旧） */
  supersedes?: string;
  /** 撤回账本：true 时任何检索都不再返回 */
  corrected?: boolean;
}

/** 未解决清单条目：当前仍明确没有结束的事项 */
export interface UnresolvedItem {
  id: string;
  charId?: string;
  text: string;
  done: boolean;
  ts: number;
  updatedAt: number;
}

/** 会话线索：一个「窗口」结束时留下的历史快照 */
export interface ThreadSnapshot {
  id: string;
  charId?: string;
  /** 上个窗口留下的话（最后一条助手消息摘要） */
  summary: string;
  /** 关闭时仍未了的事项数 */
  openCount: number;
  closedAt: number;
}

/** 新增记忆的草稿（自动提炼 / 手动 / LLM 总结共用） */
export interface RecordDraft {
  title: string;
  body: string;
  status: string;
  source: MemorySource;
}

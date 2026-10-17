# 生理内核移植说明（body 模块）

本目录为生理系统（身体周期 + 七项数值 + 事件触发 + `<ephemeral_state>` 状态卡注入）的 TypeScript 实现。

## 已移植（本轮范围内）

| 文件 | 对应上游语义 |
| --- | --- |
| `config.ts` | 生理内核默认配置：6 个周期、7 项身体数值（含档位文案）、18 个事件、状态卡提示选项、初始数值 |
| `engine.ts` | 时间推进引擎：分段 tick（每段 ≤6h，最多 48 段），事件过期 → 周期过期 → 蓄积感增长 → 数值向周期目标靠近 → 疲惫回落 → 事件 tick → 等待压力 |
| `triggers.ts` | 默认事件触发表（宿主层）：10 分钟节流 → 时间窗口 → 硬条件 + 冷却 + 窗口去重 → 概率抽取 → 优先级取一个主事件 |
| `card.ts` | `<ephemeral_state>` 状态卡渲染 + 结构化身体状态（面板 UI 用数值 / 档位 / 说明） |
| `store.ts` | 按角色持久化（localStorage `starling.body.<charId>`）+ 发消息前的完整流程（tick → 事件触发 → 渲染状态卡） |

## 未移植（超出本轮范围）

### 结算系统（settlement）

- **语义**：一段互动结束后，由模型对「已经发生的互动」做结算——输出 `settlement_result`
  （neutral / continued / escalated / interrupted / cooled_down / released）、`ejaculated`
  标记与七项数值 delta，经归一化（普通互动 ±3、强刺激 ±4；未释放时蓄积感不下调；
  释放时按周期补足或截断扣减）后写回身体状态。
- **未移植原因**：结算的输入是「宿主提供的消息窗口文本」，窗口边界由宿主消息调度决定
  （上游模块自身不决定窗口边界）。当前宿主的消息窗口调度未实现，**超出本轮范围**。

### 梦境系统（dreams）

- **语义**：在梦境时间窗（默认 00:00–08:30）内、距对方最后一条消息沉默满
  `dream_silence_min_minutes`（默认 120 分钟）、且距上一张梦境卡超过冷却
  （默认 24 小时）时，按概率抽取梦境卡事件，生成不少于 `dream_card_min_chars`
  （默认 2000 字）的梦境内容，并以 after_effect_tags
  （released / unfinished / aroused / possessive / tender）结算梦后余波到七项数值。
- **未移植原因**：触发条件依赖宿主对「对方最后一条消息时间」的调度与消息窗口管理，
  当前宿主未提供该调度，**超出本轮范围**。

## 后续移植建议

1. 先在宿主层（`hooks/useCompanion.ts`）实现消息窗口调度：窗口边界截取、
   对方最后消息时间戳记录、结算/梦境触发点的挂接。
2. 再按上游 `settlement.py` / `dreams.py` 的语义补齐本目录的
   `settlement.ts` / `dreams.ts`（独立文件，不并入现有文件）。
   请求配置直接取 `api.ts` 的 `resolveBodyApi(settings)`——地址 / 密钥 / 模型
   可独立填写（`bodyBaseUrl` / `bodyApiKey` / `bodyModel`），逐项留空自动回落主模型；
   设置「生理系统」里已有服务商预设、拉取模型与测试连接。
3. `triggers.ts` 中「梦后余温」相关事件依赖梦境系统，移植完成后参与事件抽取。

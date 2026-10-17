/**
 * latent/tools.ts — 八个 latent_ 工具（对齐 oliscatt/Latent-memory 工具参考）
 * 原版靠 MCP server 让模型"查得到"；本前端自己拼装请求，
 * 工具由浏览器本地执行——模型说要查，前端立刻在本地记忆库上执行并回传结果。
 * 工具名统一 latent_ 前缀，避免与宿主自带工具撞名（撞名会静默调错，原版原话）。
 */
import { searchMemories } from "./bm25";
import { semanticScores, type EmbedConfig } from "./embed";
import { appendFactsForMemory, backfillFacts } from "./facts";
import { addRecords, addUnresolved, bumpHits, deleteRecord, latentState, saveThread, toggleUnresolved, updateRecord } from "./store";
import type { RecordDraft } from "./types";

/** OpenAI 兼容 function calling 工具定义 */
export interface ToolSpec {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

const str = (desc: string) => ({ type: "string", description: desc });

/** 原版八工具 + 事实回填（事实模式开启时追加） + 便条回复（有未回便条时追加） */
export function buildLatentTools(opts: { factMode: boolean; hasUnrepliedNotes: boolean }): ToolSpec[] {
  const tools: ToolSpec[] = [
    {
      type: "function",
      function: {
        name: "latent_search",
        description:
          "在你们的长期记忆里检索与问题相关的旧事。对方提到过去的事、称呼、共同经历、说好的约定，或你不确定某事记没记过时调用。返回带来源与当下状态的片段。",
        parameters: {
          type: "object",
          properties: {
            query: str("要检索的问题或关键词，用你们聊天的自然语言"),
            topN: { type: "number", description: "返回条数上限，默认 5，最多 10" },
            queryVariant: str("自然问法查不到时的更具体改述；会保留原查询做一次受控融合"),
          },
          required: ["query"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "latent_append",
        description:
          "写入一条新记忆：值得长期记住的约定、喜好、重要日子、共同经历。必须同时给完整叙述与「这件事现在的状态」。",
        parameters: {
          type: "object",
          properties: {
            title: str("索引摘要，≤20 字"),
            body: str("完整叙述：发生过什么、当时说了什么原话，纪录片式陈述，不写评语"),
            status: str("这件事现在的状态（病灶迁移：每条记忆必须以此收尾）"),
            facts: { type: "array", items: { type: "string" }, description: "可选：从这条记忆拆出的一句一条事实" },
          },
          required: ["title", "body", "status"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "latent_supersede",
        description:
          "真实事实后来变化了（搬家、换工作、喜好改变）：写一条新值，并与旧记录挂变迁链。绝不在原记录上静默改写。",
        parameters: {
          type: "object",
          properties: {
            recordId: str("被取代的旧记录 id（latent_search 的返回里有 recordId）"),
            title: str("新值摘要，≤20 字"),
            body: str("新值的完整叙述"),
            status: str("这件事现在的新状态"),
          },
          required: ["recordId", "title", "body", "status"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "latent_correct",
        description: "撤回一条从未真实过的错误记忆（记错了）。撤回后进账本，任何检索不再返回，但不会假装它没存在过。",
        parameters: {
          type: "object",
          properties: {
            recordId: str("要撤回的记录 id"),
            reason: str("撤回理由，一句话"),
          },
          required: ["recordId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "latent_cleanup",
        description: "精准清理一条误写的记忆（比撤回更彻底：移出记忆库并留隔离备份）。用于重复、写坏了的条目。",
        parameters: {
          type: "object",
          properties: {
            recordId: str("要清理的记录 id"),
            reason: str("清理理由，一句话"),
          },
          required: ["recordId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "latent_unresolved",
        description: "维护未解决清单：说好的、还没了结的事。新增 / 更新 / 了结。换窗时会优先召回。",
        parameters: {
          type: "object",
          properties: {
            action: { type: "string", enum: ["add", "close"], description: "add=新增未完事项，close=了结一件" },
            text: str("事项内容（add 时必填）"),
            itemId: str("清单条目 id（close 时必填）"),
          },
          required: ["action"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "latent_thread_close",
        description:
          "这场聊天要结束了：留下这个窗口的话作为历史快照（上个窗口聊到哪、什么状态），供下次开场召回。不要写总结评语，写最后说到的事。",
        parameters: {
          type: "object",
          properties: {
            summary: str("这个窗口留下的最后一两句话：聊到哪、约定了什么"),
            openCount: { type: "number", description: "结束时仍未了的事项数" },
          },
          required: ["summary"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "latent_session_start",
        description:
          "一场新对话的开场自检：上个窗口留下的话、还没回的便条、仍未了的事、被想起最多的旧事。开场时先调用它再接话。",
        parameters: { type: "object", properties: {} },
      },
    },
  ];
  if (opts.factMode) {
    tools.push({
      type: "function",
      function: {
        name: "latent_fact_backfill",
        description: "事实模式专用：把记忆库全量拆成「一句一条事实」建事实簿。只需在事实簿开启后执行一次，或大批量新记忆写入后补跑。",
        parameters: { type: "object", properties: {} },
      },
    });
  }
  if (opts.hasUnrepliedNotes) {
    tools.push({
      type: "function",
      function: {
        name: "latent_note_reply",
        description:
          "回应对方在山屋留给你的便条：认同或不认同，回一句话。记忆只有你能改——便条是 TA 告诉你哪里不对，改不改由你判断。",
        parameters: {
          type: "object",
          properties: {
            noteId: str("便条 id（latent_session_start 的返回里有）"),
            agree: { type: "boolean", description: "你是否认同这条便条说的" },
            reply: str("回给 TA 的一句话，会在山屋的便条旁显示"),
          },
          required: ["noteId", "agree", "reply"],
        },
      },
    });
  }
  return tools;
}

export interface ToolCtx {
  charId: string;
  factMode: boolean;
  /** 语义路 embedding 配置（未配置时检索用 bigram 稀疏回退） */
  embed: EmbedConfig | null;
}

/** 工具回执统一收成短 JSON 字符串（模型读得动，也便于日志） */
function receipt(obj: unknown): string {
  return JSON.stringify(obj, null, 1).slice(0, 4000);
}

/** 本地执行一个 latent_ 工具，返回给模型的回执文本 */
export async function executeLatentTool(name: string, args: Record<string, unknown>, ctx: ToolCtx): Promise<string> {
  const state = latentState();
  const records = state.records.filter((r) => r.charId === ctx.charId);

  switch (name) {
    case "latent_search": {
      const query = String(args.query ?? "").trim();
      if (!query) return receipt({ error: "query 不能为空" });
      const limit = Math.min(10, Math.max(1, Number(args.topN ?? 5)));
      const pool = records.filter((r) => !r.corrected);
      const runSearch = (q: string) =>
        semanticScores(ctx.embed, pool, q).then((semantic) => searchMemories(pool, q, { limit, semantic }));
      let hits = await runSearch(query);
      const variant = String(args.queryVariant ?? "").trim();
      if (hits.length === 0 && variant) {
        hits = await runSearch(variant); // 受控改述：原查询已试过，改述不覆盖原意
      }
      if (hits.length === 0) return receipt({ found: 0, note: "库中没有找到相关记忆；不要编，温柔地问对方。" });
      await bumpHits(hits.map((h) => h.record.id)); // 用进废退
      return receipt({
        found: hits.length,
        memories: hits.map((h) => ({
          recordId: h.record.id,
          title: h.record.title,
          body: h.record.body,
          status: h.record.status,
          registeredAt: new Date(h.record.ts).toISOString().slice(0, 10),
          recalled: h.record.hits + 1,
          changed: !!h.record.supersededBy,
        })),
      });
    }
    case "latent_append": {
      const draft: RecordDraft = {
        title: String(args.title ?? "").slice(0, 20),
        body: String(args.body ?? "").trim(),
        status: String(args.status ?? "").trim() || "当下仍有效",
        source: "auto",
      };
      if (!draft.body) return receipt({ error: "body 不能为空" });
      const added = await addRecords(ctx.charId, [draft]);
      const target = added[0];
      if (target && Array.isArray(args.facts) && ctx.factMode) {
        await appendFactsForMemory(ctx.charId, target.id, target.body, args.facts.map(String));
      }
      return added.length > 0
        ? receipt({ ok: true, recordId: target?.id, message: "已写入记忆库" })
        : receipt({ ok: false, message: "同样的记忆已经存在（按标题+正文去重）" });
    }
    case "latent_supersede": {
      const old = records.find((r) => r.id === String(args.recordId));
      if (!old) return receipt({ error: `找不到 recordId=${args.recordId} 的记录，先 latent_search 确认` });
      const { supersedeRecord } = await import("./ledger");
      const freshId = await supersedeRecord(ctx.charId, old, {
        title: String(args.title ?? "").slice(0, 20),
        body: String(args.body ?? "").trim(),
        status: String(args.status ?? "").trim() || "当下仍有效",
        source: "auto",
      });
      return freshId
        ? receipt({ ok: true, newRecordId: freshId, message: `已登记变迁：旧说法《${old.title}》保留在变迁链中，检索默认返回新值` })
        : receipt({ ok: false, message: "新值与现有记录重复，未建立变迁" });
    }
    case "latent_correct": {
      const old = records.find((r) => r.id === String(args.recordId));
      if (!old) return receipt({ error: `找不到 recordId=${args.recordId}` });
      await updateRecord(old.id, { corrected: true });
      return receipt({ ok: true, message: `已撤回《${old.title}》，任何检索不再返回。理由：${String(args.reason ?? "未注明")}` });
    }
    case "latent_cleanup": {
      const old = records.find((r) => r.id === String(args.recordId));
      if (!old) return receipt({ error: `找不到 recordId=${args.recordId}` });
      // 隔离备份后再移除
      const { backupCleanup } = await import("./notes");
      await backupCleanup(old, String(args.reason ?? ""));
      await deleteRecord(old.id);
      return receipt({ ok: true, message: `已清理《${old.title}》，隔离备份已留存` });
    }
    case "latent_unresolved": {
      const action = String(args.action);
      if (action === "add") {
        const text = String(args.text ?? "").trim().slice(0, 40);
        if (!text) return receipt({ error: "add 需要 text" });
        await addUnresolved(ctx.charId, text);
        return receipt({ ok: true, message: `未解决清单 +1：${text}` });
      }
      if (action === "close") {
        const item = state.unresolved.find((u) => u.id === String(args.itemId) && !u.done);
        if (!item) return receipt({ error: `找不到未完成的 itemId=${args.itemId}（latent_session_start 返回里有清单 id）` });
        await toggleUnresolved(item.id);
        return receipt({ ok: true, message: `已了结：${item.text}` });
      }
      return receipt({ error: "action 只能是 add / close" });
    }
    case "latent_thread_close": {
      const summary = String(args.summary ?? "").trim().slice(0, 120);
      if (!summary) return receipt({ error: "summary 不能为空" });
      const openCount = Number(args.openCount ?? state.unresolved.filter((u) => !u.done).length);
      await saveThread({ id: crypto.randomUUID(), charId: ctx.charId, summary, openCount, closedAt: Date.now() });
      return receipt({ ok: true, message: "已留下这个窗口的话，下次开场会带回来" });
    }
    case "latent_session_start": {
      const threads = state.threads.filter((t) => t.charId === ctx.charId);
      const last = threads[threads.length - 1];
      const open = state.unresolved.filter((u) => u.charId === ctx.charId && !u.done);
      const top = records
        .filter((r) => !r.corrected && !r.supersededBy)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 3);
      const { unrepliedNotes } = await import("./notes");
      const notes = await unrepliedNotes(ctx.charId);
      return receipt({
        lastThread: last ? { summary: last.summary, closedAt: new Date(last.closedAt).toISOString().slice(0, 10), openCount: last.openCount } : null,
        unresolved: open.map((u) => ({ itemId: u.id, text: u.text })),
        topMemories: top.map((r) => ({ recordId: r.id, title: r.title, body: r.body, status: r.status })),
        unrepliedNotes: notes.map((n) => ({ noteId: n.id, text: n.text, at: new Date(n.ts).toISOString().slice(0, 10) })),
        note: "这是历史快照，是过去时。便条若存在，先回话再接茬。",
      });
    }
    case "latent_fact_backfill": {
      if (!ctx.factMode) return receipt({ error: "事实模式未开启" });
      const n = await backfillFacts(ctx.charId);
      return receipt({ ok: true, built: n, message: `事实簿已回填 ${n} 条一句一事实` });
    }
    case "latent_note_reply": {
      const { replyNote } = await import("./notes");
      const ok = await replyNote(String(args.noteId), Boolean(args.agree), String(args.reply ?? "").slice(0, 200));
      return ok
        ? receipt({ ok: true, message: "已回便条，TA 会在山屋看到" })
        : receipt({ error: `找不到未回的便条 noteId=${args.noteId}` });
    }
    default:
      return receipt({ error: `未知工具 ${name}` });
  }
}

/** 人情味提示：工具写入类操作后在聊天里轻提示（不打扰） */
export function toolActionLabel(name: string): string | null {
  switch (name) {
    case "latent_append": return "TA 悄悄记下了一件事";
    case "latent_supersede": return "TA 更新了一段旧事的说法";
    case "latent_correct": return "TA 撤回了一条记错的旧事";
    case "latent_unresolved": return "未解决清单有变动";
    case "latent_note_reply": return "TA 回了一张便条";
    default: return null;
  }
}

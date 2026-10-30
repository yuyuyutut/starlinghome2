/**
 * useCompanion.ts — 应用状态中枢
 * 串起角色卡、记忆、好感度、消息流。各模块 UI 只管展示，逻辑都在这里。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { db, loadSettings, saveSettings, type Settings } from "@/lib/db";
import { streamChat, chatOnce, type ChatMessage } from "@/lib/llm";
import { DEFAULT_CHARACTER, type CharacterCard } from "@/modules/character/types";
import { compileSystemPrompt } from "@/modules/character/prompt";
/* 显影记忆（Latent-memory 架构移植）：四层数据 + 检索浮现 + 换窗召回 */
import {
  extractRecordsFromUserMessage,
  guessUserNameFromRecords,
  parseLLMRecords,
  pinnedLines,
} from "@/modules/latent/extract";
import { buildPassiveBlock } from "@/modules/latent/passive";
import { buildRecallBlock } from "@/modules/latent/recall";
import { buildSnapshot } from "@/modules/latent/thread";
import { suggestUnresolved } from "@/modules/latent/unresolved";
import { type EmbedConfig } from "@/modules/latent/embed";
import { surfaceFacts } from "@/modules/latent/facts";
import { buildNotesBlock, unrepliedNotes } from "@/modules/latent/notes";
import { buildLatentTools, executeLatentTool, toolActionLabel } from "@/modules/latent/tools";
import { runToolLoop } from "@/modules/latent/toolLoop";
import { attachThoughtMarker, buildThoughtMarker, splitThought, splitThoughtStreaming, stripThoughtEcho, validateThoughtText, THOUGHT_MAX } from "@/modules/thought/mark";
import { buildThoughtTool, executeThoughtTool } from "@/modules/thought/tools";
import { editThoughtRecord } from "@/modules/thought/store";
// 提示词缓存（Cove 笔记）：稳定前缀 / 工具 schema 打 cache_control + 本地观测日志
import {
  buildCacheableSystem,
  cacheSkipReason,
  cacheableTools,
  hashText,
  splitStableDynamic,
  stableSessionId,
  type CacheSegment,
} from "@/modules/cache/split";
import { logCacheRequest, logCacheUsage } from "@/modules/cache/log";
// 生理系统（Eventide 移植）：tick 推进 + 事件触发 + <ephemeral_state> 状态卡注入
import { advanceBodyForChar, clearBodyState } from "@/modules/body/store";
import {
  addRecords,
  addUnresolved,
  bumpHits,
  clearLatent,
  consumePendingRecall,
  deleteRecord,
  latentState,
  loadLatent,
  saveThread,
  setPendingRecall,
  useLatent,
} from "@/modules/latent/store";
import { scoreMessage, greetingByHour, timeDesc, daysTogether, levelOf } from "@/modules/affection/affection";
import { localReply } from "@/modules/chat/localReply";
import { isThinkingOn, thinkingExtraBody } from "@/modules/settings/thinking";
import { consumePills, clearPills } from "@/modules/pills/store";
import { buildPillPrefix } from "@/modules/pills/inject";
import {
  LEGACY_CHAR_ID,
  createCharacter as createCharacterRow,
  deleteCharacter as deleteCharacterRow,
  getCharMeta,
  loadActiveCharId,
  loadCharacters,
  migrateScopedRows,
  saveActiveCharId,
  scoped,
  setCharMeta,
} from "@/modules/character/characters";

export interface Msg {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** 属于哪个聊天对象（角色） */
  charId?: string;
  /** 用户发送的图片（压缩后的 JPEG data URI，仅 user 消息） */
  image?: string;
  /** 思维链内容（服务商返回 reasoning_content 时才有） */
  thinking?: string;
  /** 双方思考：user=没说出话的附言（私密，不进模型上下文，只经 read_user_thought）；assistant=[[THOUGHT:]] 旁白（已剥出） */
  thought?: string;
  /** 附言首次被 read_user_thought 成功读取的时间（已读锁定） */
  thoughtSeenAt?: number;
  /** 附言编辑前的旧文归档（可恢复，不注入模型） */
  thoughtLog?: string[];
  ts: number;
}

export interface MemoryItem {
  id: string;
  content: string;
  /** 属于哪个聊天对象（角色） */
  charId?: string;
  source: "auto" | "manual" | "llm";
  ts: number;
}

export interface Toast {
  id: string;
  text: string;
  kind: "heart" | "info";
}

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MAX_CONTEXT = 24; // 每次请求携带的最大消息条数

export function useCompanion() {
  const [ready, setReady] = useState(false);
  const [characters, setCharacters] = useState<CharacterCard[]>([]);
  const [charId, setCharId] = useState<string>(LEGACY_CHAR_ID);
  const [card, setCard] = useState<CharacterCard>(DEFAULT_CHARACTER);
  const [messages, setMessages] = useState<Msg[]>([]);
  /** 显影记忆状态（模块级外部存储，记忆页与聊天注入共用） */
  const latent = useLatent();
  /** 旧接口兼容视图：未被撤回的记忆（供旧 MemoryPanel 等使用） */
  const memories: MemoryItem[] = latent.records
    .filter((r) => !r.corrected)
    .map((r) => ({ id: r.id, charId: r.charId, content: r.body, source: r.source, ts: r.ts }));
  const [affection, setAffection] = useState(0);
  const [firstVisit, setFirstVisit] = useState<number>(Date.now());
  const [typing, setTyping] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const abortRef = useRef<AbortController | null>(null);
  const bootedRef = useRef(false);
  /** 本会话最近一次合上会话线索的时间（5 分钟内不重复快照） */
  const snapshottedRef = useRef(0);
  /** 当前服务商不支持 function calling 时置真，本会话降级为主动注入模式 */
  const toolsUnsupportedRef = useRef(false);

  const toast = useCallback((text: string, kind: Toast["kind"] = "info") => {
    const id = uid();
    setToasts((t) => [...t, { id, text, kind }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  /* ---------- 合上当前窗口的会话线索（thread close；5 分钟内不重复） ---------- */
  const snapshotNow = useCallback(async (id: string, msgs: Msg[]) => {
    const now = Date.now();
    if (now - snapshottedRef.current < 5 * 60 * 1000) return;
    const openCount = latentState().unresolved.filter((u) => !u.done).length;
    const snap = buildSnapshot(id, msgs, openCount);
    if (snap) {
      await saveThread(snap);
      snapshottedRef.current = now;
    }
  }, []);

  /* ---------- 按角色加载数据（初始化 / 切换角色时复用） ---------- */
  const loadCharData = useCallback(async (id: string): Promise<CharacterCard> => {
    const now = Date.now();
    const loaded = await db.get<CharacterCard>("characters", id);
    const activeCard = loaded ?? DEFAULT_CHARACTER;
    setCard(activeCard);

    const [rawMsgs, aff] = await Promise.all([db.all<Msg>("messages"), getCharMeta<number>(id, "affection", 0)]);
    let first = await getCharMeta<number>(id, "firstVisit", 0);
    const last = await getCharMeta<number>(id, "lastVisit", 0);
    if (!first) {
      first = now;
      await setCharMeta(id, "firstVisit", first);
    }
    setFirstVisit(first);
    setAffection(aff);

    // 载入显影记忆（含旧数据迁移）
    const fresh = await loadLatent(id);

    const sorted = scoped(rawMsgs, id).sort((a, b) => a.ts - b.ts);
    let greetingMsg: Msg | null = null;
    const hourGreet = greetingByHour();
    if (sorted.length === 0) {
      // 第一次和这个角色说话：开场白 + 时段问候
      greetingMsg = {
        id: uid(),
        role: "assistant",
        charId: id,
        content: `${hourGreet}～${activeCard.firstMessage}`,
        ts: now,
      };
    } else if (now - last > 20 * 3600 * 1000) {
      // 隔了一天以上：先合上上个窗口的会话线索，再换窗召回，最后「好久不见」
      const prevThread = fresh.threads[fresh.threads.length - 1];
      const snap = buildSnapshot(id, sorted, fresh.unresolved.filter((u) => !u.done).length);
      let recalled = 0;
      if (loadSettings().latentRecall) {
        const top = fresh.records
          .filter((r) => !r.corrected && !r.supersededBy)
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 3);
        const block = buildRecallBlock({
          lastThread: prevThread,
          openItems: fresh.unresolved.filter((u) => !u.done),
          topRecords: top,
          daysGap: Math.max(1, Math.round((now - last) / 86400000)),
        });
        if (block) {
          setPendingRecall(block);
          recalled = 1;
        }
      }
      if (snap) await saveThread(snap);
      greetingMsg = {
        id: uid(),
        role: "assistant",
        charId: id,
        content: `${hourGreet}！好久不见，我等了你好久${activeCard.avatar ?? "🦊"} 有想我吗？`,
        ts: now,
      };
      if (recalled > 0) toast("已从记忆里带回上次的话和未完的事", "info");
    }
    if (greetingMsg) {
      sorted.push(greetingMsg);
      await db.put("messages", greetingMsg);
    }
    setMessages(sorted);
    await setCharMeta(id, "lastVisit", now);
    return activeCard;
  }, [toast]);

  /* ---------- 初始化：迁移旧数据 → 选角色 → 读库 + 注入问候 ---------- */
  useEffect(() => {
    (async () => {
      await migrateScopedRows("messages");
      await migrateScopedRows("memories");
      await migrateScopedRows("unresolved");
      await migrateScopedRows("threads");
      await migrateScopedRows("facts");
      await migrateScopedRows("notes");

      let chars = await loadCharacters();
      if (chars.length === 0) {
        await db.put("characters", DEFAULT_CHARACTER);
        chars = [DEFAULT_CHARACTER];
      }
      setCharacters(chars);

      const saved = loadActiveCharId();
      const active = chars.find((c) => c.id === saved) ?? chars.find((c) => c.id === LEGACY_CHAR_ID) ?? chars[0];
      setCharId(active.id);
      saveActiveCharId(active.id);

      await loadCharData(active.id);
      setReady(true);
      bootedRef.current = true;
    })();
  }, [loadCharData]);

  /* ---------- 切换 / 新建角色 ---------- */
  const switchCharacter = useCallback(
    async (id: string) => {
      if (id === charId) return;
      abortRef.current?.abort();
      await setCharMeta(charId, "lastVisit", Date.now());
      // 离开前合上当前窗口的会话线索（换窗召回要用）
      await snapshotNow(charId, messages);
      setCharId(id);
      saveActiveCharId(id);
      const next = await loadCharData(id);
      toast(`现在是和 ${next.name} 的聊天`, "info");
    },
    [charId, loadCharData, toast, snapshotNow, messages]
  );

  const createCharacter = useCallback(
    async (name?: string) => {
      const created = await createCharacterRow(name);
      setCharacters((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, "zh")));
      await switchCharacter(created.id);
      return created;
    },
    [switchCharacter]
  );

  /* ---------- 删除角色卡：连带该角色的聊天记录与记忆，删光时重建默认伙伴 ---------- */
  const deleteCharacter = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      await deleteCharacterRow(id);
      clearBodyState(id); // 生理状态随角色一并清掉
      let remaining = await loadCharacters();
      if (remaining.length === 0) {
        const created = await createCharacterRow();
        remaining = [created];
      }
      setCharacters(remaining);
      if (id === charId) {
        const next = remaining[0];
        saveActiveCharId(next.id);
        setCharId(next.id);
        await loadCharData(next.id);
        toast(`「${next.name}」还在；删除的角色连同聊天记录与记忆一起清掉了`, "info");
      } else {
        toast("角色已删除，连同聊天记录与记忆", "info");
      }
    },
    [charId, loadCharData, toast]
  );

  /* ---------- 记忆写入（显影记录式，自动去重，按角色隔离） ---------- */
  const commitMemories = useCallback(
    async (drafts: { content: string; source: MemoryItem["source"] }[]) => {
      if (drafts.length === 0) return 0;
      const added = await addRecords(
        charId,
        drafts.map((d) => ({
          title: d.content.trim().slice(0, 12),
          body: d.content,
          status: "当下仍有效",
          source: d.source,
        }))
      );
      return added.length;
    },
    [charId]
  );

  const deleteMemory = useCallback(async (id: string) => {
    await deleteRecord(id);
  }, []);

  /* ---------- 角色卡 ---------- */
  const saveCard = useCallback(async (next: CharacterCard) => {
    setCard(next);
    await db.put("characters", next);
    setCharacters((prev) => {
      const exists = prev.some((p) => p.id === next.id);
      const list = exists ? prev.map((p) => (p.id === next.id ? next : p)) : [...prev, next];
      return list.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    });
    toast("角色卡已保存", "info");
  }, [toast]);

  /* ---------- 双方思考：编辑附言（未读可改，已读锁定 409） ---------- */
  const editThought = useCallback(
    async (messageId: string, text: string) => {
      let t: string | null = null;
      try {
        t = validateThoughtText(text);
      } catch {
        toast(`附言最长 ${THOUGHT_MAX} 字`, "info");
        return;
      }
      const r = await editThoughtRecord(messageId, charId, t);
      if (r.status === 200) {
        const row = await db.get<Msg>("messages", messageId);
        if (row) setMessages((prev) => prev.map((m) => (m.id === messageId ? row : m)));
      } else if (r.status === 409) {
        // 读后才改：把锁定状态同步进界面
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId && !m.thoughtSeenAt ? { ...m, thoughtSeenAt: Date.now() } : m))
        );
        toast("TA 已经读过了，附言锁定了", "info");
      }
    },
    [charId, toast]
  );

  /* ---------- 语音通话：一轮结束后的落库（双消息入库 + 好感度 + 自动记忆提取，口径与发消息一致） ---------- */
  const appendCallExchange = useCallback(
    async (userText: string, assistantText: string) => {
      const now = Date.now();
      const userMsg: Msg = { id: uid(), role: "user", charId, content: userText, ts: now };
      const asstMsg: Msg = { id: uid(), role: "assistant", charId, content: assistantText, ts: now + 1 };
      setMessages((prev) => [...prev, userMsg, asstMsg]);
      await db.put("messages", userMsg);
      await db.put("messages", asstMsg);

      // 好感度（与 send 同规则）
      const delta = scoreMessage(userText);
      if (delta !== 0) {
        setAffection((prev) => {
          const next = Math.max(0, prev + delta);
          void setCharMeta(charId, "affection", next);
          const before = levelOf(prev);
          const after = levelOf(next);
          if (after.min > before.min) {
            toast(`好感度升级：${after.emoji} ${after.name}！`, "heart");
          } else if (delta > 0) {
            toast(`好感度 +${delta}`, "heart");
          }
          return next;
        });
      }

      // 自动记忆提取（通话固定走宿主注入口径）
      const recDrafts = extractRecordsFromUserMessage(userText);
      if (recDrafts.length > 0) {
        const added = await addRecords(charId, recDrafts);
        if (added.length > 0) toast("记住了一些关于你的事", "info");
      }
      const un = suggestUnresolved(userText);
      if (un.length > 0) await addUnresolved(charId, un[0]);
    },
    [charId, toast]
  );

  /* ---------- 设置 ---------- */
  const updateSettings = useCallback((next: Settings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  /* ---------- 发消息 ---------- */
  const send = useCallback(
    async (text: string, image?: string, thought?: string) => {
      const trimmed = text.trim() || (image ? "看看这张图～" : "");
      if (!trimmed || typing) return;

      // 附言校验：超长直接拒绝，不偷偷截断（对齐教程输入策略）
      let thoughtText: string | null = null;
      try {
        thoughtText = validateThoughtText(thought);
      } catch {
        toast(`附言最长 ${THOUGHT_MAX} 字，删减一些再发`, "info");
        return;
      }

      const userMsg: Msg = {
        id: uid(),
        role: "user",
        charId,
        content: trimmed,
        image,
        thought: thoughtText ?? undefined,
        ts: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      await db.put("messages", userMsg);

      // 好感度变化（带提示）
      const delta = scoreMessage(trimmed);
      if (delta !== 0) {
        setAffection((prev) => {
          const next = Math.max(0, prev + delta);
          void setCharMeta(charId, "affection", next);
          const before = levelOf(prev);
          const after = levelOf(next);
          if (after.min > before.min) {
            toast(`好感度升级：${after.emoji} ${after.name}！`, "heart");
          } else if (delta > 0) {
            toast(`好感度 +${delta}`, "heart");
          }
          return next;
        });
      }

      // 宿主自动提取只在注入模式运行；工具模式下记忆读写全部交给 latent_ 工具（对齐原版：模型自己决定记什么）
      const toolsOnEarly = settings.latentTools && !toolsUnsupportedRef.current;
      if (!toolsOnEarly) {
        // 自动记忆提取（记录式：摘要 + 正文 + 当下状态）
        const recDrafts = extractRecordsFromUserMessage(trimmed);
        if (recDrafts.length > 0) {
          const added = await addRecords(charId, recDrafts);
          if (added.length > 0) toast("记住了一些关于你的事", "info");
        }
        // 未解决清单：察觉「下次 / 说好了 / 改天」类约定
        const un = suggestUnresolved(trimmed);
        if (un.length > 0) await addUnresolved(charId, un[0]);
      }

      // 发起回复
      setTyping(true);
      const pendingId = uid();
      setMessages((prev) => [...prev, { id: pendingId, role: "assistant", content: "", thinking: "", ts: Date.now() }]);

      const finish = async (raw: string, thinking = "") => {
        // 双方思考：完整回复严格拆分，旁白单独存；未闭合的块不进公开回复
        const sp = splitThought(raw);
        const finalMsg: Msg = {
          id: pendingId,
          role: "assistant",
          content: stripThoughtEcho(sp.reply),
          thinking,
          thought: sp.thought || undefined,
          ts: Date.now(),
        };
        setMessages((prev) => prev.map((m) => (m.id === pendingId ? finalMsg : m)));
        await db.put("messages", finalMsg);
        setTyping(false);
      };

      const patch = (full: string) =>
        setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, content: full } : m)));

      // 流式过程中旁白缓冲：标记未闭合时不把残块画进公开气泡
      const patchStream = (full: string) => {
        const sp = splitThoughtStreaming(full);
        setMessages((prev) =>
          prev.map((m) => (m.id === pendingId ? { ...m, content: sp.reply, thought: sp.thought } : m))
        );
      };

      let thinkingAcc = "";
      const patchThinking = (full: string) => {
        thinkingAcc = full;
        setMessages((prev) => prev.map((m) => (m.id === pendingId ? { ...m, thinking: full } : m)));
      };

      if (!settings.apiKey) {
        // 本地模式：不消耗 API，用规则生成一个"假装在思考"的回复
        await new Promise((r) => setTimeout(r, 700 + Math.random() * 800));
        // 本地模式：取权重最高的几条有效记忆当素材
        const localMats = [...latent.records]
          .filter((r) => !r.corrected && !r.supersededBy)
          .sort((a, b) => b.weight - a.weight)
          .slice(0, 8)
          .map((r) => r.body);
        const reply = localReply(card, trimmed, localMats);
        let acc = "";
        for (const ch of reply) {
          acc += ch;
          patch(acc);
          await new Promise((r) => setTimeout(r, 28));
        }
        await finish(acc);
        void maybeAutoSummarize();
        return;
      }

      try {
        abortRef.current = new AbortController();
        // 药丸（用完即焚）：发出即算吃掉，只拼进这一轮请求的 user 消息，不入聊天记录
        const pills = consumePills();
        const pillPrefix = buildPillPrefix(pills.map((p) => p.code));
        if (pills.length > 0) toast(`已服用 ${pills.map((p) => p.name).join("、")} · 只作用这一次回复`, "info");
        // 两条路线（对齐原版）：latent_ 工具链（模型主动查与写）或通用宿主注入（自动浮现）
        const factMode = settings.factMode;
        const embedCfg: EmbedConfig | null =
          settings.embeddings && (settings.embedApiKey.trim() || settings.apiKey)
            ? {
                baseUrl: settings.embedBaseUrl.trim() || settings.baseUrl,
                apiKey: settings.embedApiKey.trim() || settings.apiKey,
                model: settings.embedModel.trim() || "bge-m3",
              }
            : null;
        const toolsOn = settings.latentTools && !toolsUnsupportedRef.current;
        const unNotes = await unrepliedNotes(charId);
        // 双方思考：本轮带附言，或窗口里还有未读附言时，才挂 read_user_thought
        const thoughtUnread =
          toolsOn &&
          (thoughtText !== null || messages.some((m) => m.role === "user" && m.thought?.trim() && !m.thoughtSeenAt));
        // 识图模型：本轮带图且开启 vision 时，可独立配置连接（留空沿用聊天）
        const visionCfg =
          settings.enableVision && image
            ? {
                baseUrl: settings.visionBaseUrl.trim() || settings.baseUrl,
                apiKey: settings.visionApiKey.trim() || settings.apiKey,
                model: settings.visionModel.trim() || settings.model,
              }
            : null;
        // system prompt = 角色卡 + 情境 + 置顶常驻里程碑（人格文件层；其余记忆不再全量塞入）
        const sysPrompt = compileSystemPrompt({
          card,
          memories: pinnedLines(latent.records),
          affectionLevel: levelOf(affection).name,
          affectionPoints: affection,
          greeting: greetingByHour(),
          daysTogether: daysTogether(firstVisit),
          timeDesc: timeDesc(),
          userName: guessUserNameFromRecords(latent.records),
          userPersona: settings.userPersona,
          toolsEnabled: toolsOn,
          thoughtEnabled: Boolean(thoughtUnread),
        });
        // 显影注入（只存在于本次请求，不入聊天记录）——工具模式下交给 latent_ 工具，宿主不重复注入；
        // 注入模式下：换窗召回快照 + 事实模式/块路径自动浮现 + 未回便条
        const latentBlocks: string[] = [];
        if (!toolsOn) {
          if (settings.latentRecall) {
            const recall = consumePendingRecall();
            if (recall) latentBlocks.push(recall);
          }
          if (settings.passiveRecall) {
            if (factMode) {
              const sf = await surfaceFacts(charId, trimmed, embedCfg);
              if (sf) latentBlocks.push(sf.block);
            } else {
              const passive = await buildPassiveBlock(latent.records, trimmed, embedCfg);
              if (passive) {
                latentBlocks.push(passive.block);
                if (passive.hitIds.length > 0) void bumpHits(passive.hitIds); // 用进废退
              }
            }
          }
          const notesBlock = await buildNotesBlock(charId);
          if (notesBlock) latentBlocks.push(notesBlock);
        } else if (settings.latentRecall) {
          consumePendingRecall(); // 工具模式下由 latent_session_start 负责，快照这里清掉
        }
        // 生理系统（Eventide）：发消息前 tick + 事件触发检查，状态卡落在动态区
        //（排在显影注入之后：每轮都变，属于缓存拆分的动态段）
        let bodyCard: string | null = null;
        if (settings.bodyCycle) {
          const lastUserTs = [...messages].reverse().find((m) => m.role === "user")?.ts ?? null;
          bodyCard = advanceBodyForChar(charId, {
            text: trimmed,
            triggerWords: settings.bodyTriggers,
            lastCounterpartMessageAt: lastUserTs,
            inject: settings.bodyInject,
          });
        }
        const sysBlocks = [...latentBlocks, ...(bodyCard ? [bodyCard] : [])];
        const fullSys = sysBlocks.length > 0 ? `${sysPrompt}\n\n${sysBlocks.join("\n\n")}` : sysPrompt;
        // 提示词缓存（Cove 笔记）：stable 前缀打 cache_control，dynamic 尾巴（当前情境+显影注入）不缓存；
        // 带图 / 工具回执轮按笔记 §6 停用（cacheSkipReason 判定，停用则整体退回纯文本形态）
        const cacheOn = settings.promptCache;
        const { stable, dynamic } = splitStableDynamic(fullSys);
        const baseForReq = visionCfg?.baseUrl ?? settings.baseUrl;
        const cacheHeaders = cacheOn
          ? { "X-Claude-Code-Session-Id": stableSessionId(baseForReq) }
          : undefined;
        const onCacheUsage = (u: Record<string, unknown>) => logCacheUsage(baseForReq, u);
        /** vision 开启时把带图消息转成多模态内容块；关闭时图片仅以文字标注 */
        const toContent = (m: { content: string; image?: string }): ChatMessage["content"] => {
          if (m.image && settings.enableVision) {
            return [
              { type: "text", text: m.content || "（见图片）" },
              { type: "image_url", image_url: { url: m.image } },
            ];
          }
          if (m.image) return m.content ? `${m.content}\n（附了一张图片）` : "（附了一张图片）";
          return m.content;
        };
        /** 药丸块排在本轮用户消息最前面、紧贴用户原话（阅后即焚，只存在于本次请求） */
        const withPills = (content: ChatMessage["content"]): ChatMessage["content"] => {
          if (!pillPrefix) return content;
          if (typeof content === "string") return `${pillPrefix}\n\n${content}`;
          return [{ type: "text", text: pillPrefix }, ...content];
        };
        // 存在标记（用完即焚）：只加给当轮请求的 user 消息，不写进聊天正文；模型决定要不要调工具读
        const thoughtMarker = thoughtText && toolsOn ? buildThoughtMarker(thoughtText, userMsg.id) : null;
        const withThought = (content: ChatMessage["content"]): ChatMessage["content"] =>
          thoughtMarker ? (attachThoughtMarker(content, thoughtMarker) as ChatMessage["content"]) : content;
        const history: ChatMessage[] = [
          { role: "system", content: cacheOn ? buildCacheableSystem(stable, dynamic) : fullSys },
          ...messages
            .filter((m) => m.content)
            .slice(-MAX_CONTEXT)
            .map((m) => {
              const item: ChatMessage & { reasoning_content?: string } = { role: m.role, content: toContent(m) };
              // 部分推理模型（Kimi/GLM 等）要求回传上一轮的 reasoning_content，否则报错
              if (m.role === "assistant" && m.thinking) item.reasoning_content = m.thinking;
              return item;
            }),
          { role: "user", content: withThought(withPills(toContent({ content: trimmed, image }))) },
        ];
        // 缓存停用判定（媒体 / 工具回执轮）：停用则 system 退回纯文本、工具不带 cache_control
        const cacheSkip = cacheOn ? cacheSkipReason(history) : null;
        if (cacheSkip) history[0] = { role: "system", content: fullSys };
        // 工具表提前组装（工具链与观测日志都要用）
        const tools = toolsOn
          ? [
              ...buildLatentTools({ factMode, hasUnrepliedNotes: unNotes.length > 0 }),
              ...(thoughtUnread ? [buildThoughtTool()] : []),
            ]
          : [];
        const toolsOut = cacheOn && !cacheSkip && tools.length > 0 ? cacheableTools(tools) : tools;
        if (cacheOn) {
          const segments: CacheSegment[] = [];
          if (!cacheSkip) {
            if (stable) {
              segments.push({ path: "$.messages[0].content[0]", kind: "text", chars: stable.length, hash: hashText(stable) });
            }
            if (tools.length > 0) {
              segments.push({ path: "$.tools[last]", kind: "tools", hash: hashText(JSON.stringify(tools)) });
            }
          }
          logCacheRequest(baseForReq, segments, cacheSkip);
        }
        const thinkingOn = isThinkingOn(settings.thinkingLevel);
        const ac = abortRef.current;
        const callPlain = () =>
          streamChat({
            baseUrl: visionCfg?.baseUrl ?? settings.baseUrl,
            apiKey: visionCfg?.apiKey ?? settings.apiKey,
            model: visionCfg?.model ?? settings.model,
            messages: history,
            signal: ac.signal,
            stream: settings.streamOutput,
            headers: cacheHeaders,
            onUsage: cacheOn ? onCacheUsage : undefined,
            onToken: (_d, full) => patchStream(full),
            onThinking: thinkingOn ? (_d, full) => patchThinking(full) : undefined,
            temperature: settings.temperature,
            extraBody: thinkingExtraBody(settings.thinkingLevel, settings.thinkingBudget),
          }).then((res) => finish(res.text, thinkingAcc));
        if (toolsOn) {
          try {
            const r = await runToolLoop({
              baseUrl: visionCfg?.baseUrl ?? settings.baseUrl,
              apiKey: visionCfg?.apiKey ?? settings.apiKey,
              model: visionCfg?.model ?? settings.model,
              messages: history,
              tools: toolsOut,
              signal: ac.signal,
              stream: settings.streamOutput,
              temperature: settings.temperature,
              extraBody: thinkingExtraBody(settings.thinkingLevel, settings.thinkingBudget),
              headers: cacheHeaders,
              onUsage: cacheOn ? onCacheUsage : undefined,
              firstTurnCached: cacheOn && !cacheSkip && toolsOut.length > 0,
              onToken: (_d, full) => patchStream(full),
              onThinking: thinkingOn ? (_d, full) => patchThinking(full) : undefined,
              onToolExecuted: (name) => {
                const label = toolActionLabel(name);
                if (label) toast(label, "info");
              },
              execute: (name, args) =>
                name === "read_user_thought"
                  ? executeThoughtTool(name, args, {
                      charId,
                      // 成功取得正文并完成记账：驱动界面已读状态
                      onSeen: (mid) =>
                        setMessages((prev) =>
                          prev.map((m) => (m.id === mid ? { ...m, thoughtSeenAt: Date.now() } : m))
                        ),
                    })
                  : executeLatentTool(name, args, { charId, factMode, embed: embedCfg }),
            });
            await finish(r.text, thinkingAcc);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("请求失败 400") || msg.includes("请求失败 404")) {
              // 服务商不支持 tools：降级为宿主注入模式，本会话不再尝试
              toolsUnsupportedRef.current = true;
              toast("这个模型不支持工具调用，已切换为自动注入模式", "info");
              await callPlain();
            } else {
              throw e;
            }
          }
        } else {
          await callPlain();
        }
        void maybeAutoSummarize();
      } catch (e) {
        const aborted = e instanceof DOMException && e.name === "AbortError";
        await finish(aborted ? "（话说到一半被打断了…）" : `（连接出错了：${e instanceof Error ? e.message : e}）`);
      }
    },
    [typing, charId, card, latent, affection, firstVisit, messages, settings, toast]
  );

  /* ---------- LLM 总结记忆 ---------- */
  const summarizeWithLLM = useCallback(
    async (quiet = false) => {
      // 总结模型：独立配置，留空沿用聊天
      const sumBase = settings.summaryBaseUrl.trim() || settings.baseUrl;
      const sumKey = settings.summaryApiKey.trim() || settings.apiKey;
      const sumModel = settings.summaryModel.trim() || settings.model;
      if (!sumKey) {
        if (!quiet) toast("先在「设置」里填 API Key，或直接手动添加记忆", "info");
        return;
      }
      try {
        const recent = messages
          .filter((m) => m.content)
          .slice(-40)
          .map((m) => `${m.role === "user" ? "对方" : card.name}：${m.content}`)
          .join("\n");
        const text = await chatOnce(sumBase, sumKey, sumModel, [
          {
            role: "system",
            content:
              "你是对话记忆整理助手。从下面的对话中提炼 3~8 条关于「对方」值得长期记住的信息（喜好、重要日子、情绪状态、约定等），每条一行，简短陈述句，不超过 40 字。只输出条目本身。",
          },
          { role: "user", content: recent || "（还没有对话）" },
        ]);
        const drafts = parseLLMRecords(text);
        if (drafts.length === 0) {
          if (!quiet) toast("暂时没总结出新的记忆", "info");
          return;
        }
        const added = await addRecords(charId, drafts);
        toast(added.length > 0 ? `总结出 ${added.length} 条新记忆` : "这些记忆已经记住了", "info");
      } catch (e) {
        if (!quiet) toast(`总结失败：${e instanceof Error ? e.message : e}`, "info");
      }
    },
    [settings, messages, card.name, charId, toast]
  );

  /* ---------- 自动整理：每隔 N 条消息后台总结一次 ---------- */
  const maybeAutoSummarize = useCallback(async () => {
    if (!(settings.summaryApiKey.trim() || settings.apiKey) || !settings.autoSummarize || typing) return;
    const since = await getCharMeta<number>(charId, "lastSummaryAt", 0);
    if (messages.length - since < settings.summarizeInterval) return;
    await setCharMeta(charId, "lastSummaryAt", messages.length);
    await summarizeWithLLM(true);
  }, [settings, charId, typing, messages.length, summarizeWithLLM]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  /* ---------- 页面隐藏时合上会话线索（thread close） ---------- */
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && messages.length > 2) {
        void snapshotNow(charId, messages);
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [charId, messages, snapshotNow]);

  /** 清空当前角色的聊天记录（保留记忆） */
  const clearChat = useCallback(async () => {
    abortRef.current?.abort();
    clearPills();
    const mine = scoped(await db.all<Msg>("messages"), charId);
    await Promise.all(mine.map((m) => db.del("messages", m.id)));
    const fresh: Msg = {
      id: uid(),
      role: "assistant",
      charId,
      content: `${greetingByHour()}～${card.firstMessage}`,
      ts: Date.now(),
    };
    await db.put("messages", fresh);
    setMessages([fresh]);
    toast("聊天记录已清空（记忆保留）", "info");
  }, [card.firstMessage, charId, toast]);

  /** 清空当前角色的聊天记录和记忆 */
  const clearAll = useCallback(async () => {
    abortRef.current?.abort();
    clearPills();
    const mineMsgs = scoped(await db.all<Msg>("messages"), charId);
    await Promise.all(mineMsgs.map((m) => db.del("messages", m.id)));
    await clearLatent(charId); // 记忆库 + 未解决清单 + 会话线索一并清空
    const fresh: Msg = {
      id: uid(),
      role: "assistant",
      charId,
      content: `${greetingByHour()}～${card.firstMessage}`,
      ts: Date.now(),
    };
    await db.put("messages", fresh);
    setMessages([fresh]);
    toast("记录和记忆都已清空，重新认识一下吧", "info");
  }, [card.firstMessage, charId, toast]);

  return {
    ready,
    characters,
    charId,
    card,
    messages,
    memories,
    /** 显影记忆状态（语音通话等模块注入上下文用） */
    latent,
    affection,
    firstVisit,
    typing,
    toasts,
    toast,
    settings,
    level: levelOf(affection),
    days: daysTogether(firstVisit),
    send,
    stop,
    saveCard,
    switchCharacter,
    createCharacter,
    deleteCharacter,
    updateSettings,
    deleteMemory,
    addMemory: useCallback(
      async (content: string) => {
        await commitMemories([{ content: content.trim(), source: "manual" }]);
        toast("已记下", "info");
      },
      [commitMemories, toast]
    ),
    summarizeWithLLM,
    editThought,
    appendCallExchange,
    clearChat,
    clearAll,
  };
}

export type Companion = ReturnType<typeof useCompanion>;

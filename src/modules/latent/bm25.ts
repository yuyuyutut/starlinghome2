/**
 * latent/bm25.ts — 三路 RRF 融合检索（对齐 Latent-memory 默认检索结构）
 *
 * ① 词面路：CJK 字符 bigram + 拉丁词 + 数字的 BM25
 * ② 语义路：向量余弦（配了 embedding 时名副其实；未配时跳过这一路）
 * ③ 关系图谱路：共享显著词（稀有词）在记忆之间连边，命中节点的邻居加权
 * 三路按 RRF（1/(60+rank)）融合；权重路不单独放行候选（没有词面/语义命中
 * 就说明与这句话无关），这与原版"未标定模型只参与排序、不单独放行"一致。
 *
 * 撤回的记录永不返回；被取代的记录默认排除，
 * 查询带「以前/曾经/搬家」等历史意图时整链放开。
 */
import type { MemoryRecord } from "./types";

/** 分词：CJK 取字符 bigram，拉丁/数字取整词 */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const lower = text.toLowerCase();
  const words = lower.match(/[a-z0-9_]+/g) ?? [];
  for (const w of words) if (w.length >= 2) tokens.push(w);
  const cjkSeq = lower.match(/[一-鿿]+/g) ?? [];
  for (const seq of cjkSeq) {
    if (seq.length === 1) tokens.push(seq);
    for (let i = 0; i + 1 < seq.length; i++) tokens.push(seq.slice(i, i + 2));
  }
  return tokens;
}

/** 历史意图：查「以前的事」时放开被取代的记录 */
const HISTORY_RE = /以前|曾经|之前|原先|那会儿|上次|变迁|早先|从前|搬家|旧址/;

export interface SearchHit {
  record: MemoryRecord;
  score: number;
}

export interface SearchOptions {
  limit?: number;
  /** 语义路：recordId → 与查询的余弦分（由 embed.ts 用云端向量或 bigram 稀疏向量预计算） */
  semantic?: Map<string, number>;
}

export async function searchMemories(records: MemoryRecord[], query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const limit = opts.limit ?? 5;
  const historyIntent = HISTORY_RE.test(q);
  const pool = records.filter((r) => {
    if (r.corrected) return false;
    if (r.supersededBy && !historyIntent) return false;
    return true;
  });
  if (pool.length === 0) return [];

  const qTokens = [...new Set(tokenize(q))];

  /* ① 词面路：BM25（标题权重最高，其次当下状态，正文最后） */
  const docTf = pool.map((r) => {
    const tf = new Map<string, number>();
    let len = 0;
    const add = (text: string, boost: number) => {
      for (const t of tokenize(text)) {
        tf.set(t, (tf.get(t) ?? 0) + boost);
        len += boost;
      }
    };
    add(r.title, 2.2);
    add(r.status, 1.4);
    add(r.body, 1);
    return { r, tf, len };
  });
  const avgLen = docTf.reduce((s, d) => s + d.len, 0) / docTf.length || 1;
  const df = new Map<string, number>();
  for (const d of docTf) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const N = docTf.length;
  const k1 = 1.5;
  const b = 0.75;
  const bm25 = new Map<string, number>();
  for (const d of docTf) {
    let score = 0;
    for (const t of qTokens) {
      const f = d.tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.len) / avgLen)));
    }
    if (score > 0) bm25.set(d.r.id, score);
  }

  /* ② 语义路：调用方预计算的余弦分（未配 embedding 时传 bigram 稀疏分或不给） */
  const semantic = new Map<string, number>();
  if (opts.semantic) {
    for (const [id, s] of opts.semantic) if (s > 0) semantic.set(id, s);
  }

  /* ③ 关系图谱路：共享显著词（稀有词）连边，命中节点的连通度加权 */
  const rare = qTokens.filter((t) => (df.get(t) ?? 0) > 0 && (df.get(t) ?? 0) <= Math.max(2, N * 0.3));
  const graph = new Map<string, number>();
  if (rare.length > 0) {
    for (const d of docTf) {
      let links = 0;
      for (const t of rare) {
        if (d.tf.has(t)) links += (df.get(t) ?? 1) - 1; // 共享一条稀有词边，权重=另一端数量
      }
      if (links > 0) graph.set(d.r.id, Math.min(links, 6));
    }
  }

  /* RRF 融合 */
  const rrf = new Map<string, number>();
  const addRank = (ids: string[]) => ids.forEach((id, i) => rrf.set(id, (rrf.get(id) ?? 0) + 1 / (60 + i)));
  addRank([...bm25.entries()].sort((a, b2) => b2[1] - a[1]).map(([id]) => id));
  addRank([...semantic.entries()].sort((a, b2) => b2[1] - a[1]).map(([id]) => id));
  addRank([...graph.entries()].sort((a, b2) => b2[1] - a[1]).map(([id]) => id));

  const lexSem = new Map<string, number>();
  for (const [id, s] of bm25) lexSem.set(id, Math.max(lexSem.get(id) ?? 0, s));
  for (const [id, s] of semantic) lexSem.set(id, Math.max(lexSem.get(id) ?? 0, s));

  const out: SearchHit[] = [];
  for (const [id, score] of rrf) {
    // 图谱路/权重路不单独放行：没有词面或语义命中就说明与这句话无关
    if ((lexSem.get(id) ?? 0) <= 0) continue;
    const rec = pool.find((r) => r.id === id);
    if (!rec) continue;
    out.push({ record: rec, score: score + (lexSem.get(id) ?? 0) * 0.001 });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/**
 * latent/embed.ts — 语义路 embedding 提供方（对齐原版 embedding_provider.py）
 * · 云端：走各家通用的 POST {baseUrl}/embeddings 形状，不内置任何一家 SDK
 * · 未配置/请求失败：自动回退字符 bigram 稀疏向量（语义路退化为词面近亲，如实标注）
 * · 向量随记录/事实缓存在 IndexedDB，同一文本不重复计费请求
 */
import { db } from "@/lib/db";
import { tokenize } from "./bm25";

export interface EmbedConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** 稀疏 bigram 向量（零依赖回退档）：token → 权重 的扁平对，cosine 用 Map 直接算 */
export type SparseVec = Map<string, number>;

export function sparseEmbed(text: string): SparseVec {
  const vec: SparseVec = new Map();
  for (const t of tokenize(text)) vec.set(t, (vec.get(t) ?? 0) + 1);
  return vec;
}

export function sparseCosine(a: SparseVec, b: SparseVec): number {
  let dot = 0, qa = 0, vb = 0;
  for (const [k, x] of a) {
    qa += x * x;
    const y = b.get(k);
    if (y !== undefined) dot += x * y;
  }
  for (const y of b.values()) vb += y * y;
  if (qa === 0 || vb === 0) return 0;
  return dot / (Math.sqrt(qa) * Math.sqrt(vb));
}

export function sparseToDense(vec: SparseVec, dims: string[]): number[] {
  return dims.map((d) => vec.get(d) ?? 0);
}

let cloudFailed = false; // 一次失败后本次会话不再重试，避免每次检索都卡网络

/** 查询向量小缓存（同一句话不重复请求） */
const queryVecCache = new Map<string, number[] | null>();
function cacheQueryVec(query: string, vec: number[] | null): number[] | null {
  if (queryVecCache.size > 50) queryVecCache.clear();
  queryVecCache.set(query, vec);
  return vec;
}

/** 云端 embedding：返回 null 表示不可用（调用方回退 sparse） */
export async function cloudEmbed(cfg: EmbedConfig, texts: string[]): Promise<number[][] | null> {
  if (cloudFailed || !cfg.apiKey) return null;
  try {
    const res = await fetch(cfg.baseUrl.replace(/\/+$/, "") + "/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, input: texts }),
    });
    if (!res.ok) throw new Error(`embeddings ${res.status}`);
    const json = await res.json();
    const vecs = (json.data ?? []).map((d: { embedding?: number[] }) => d.embedding ?? []);
    if (vecs.length !== texts.length) throw new Error("embeddings 返回数量不符");
    return vecs;
  } catch {
    cloudFailed = true;
    return null;
  }
}

export function resetEmbedFailure() {
  cloudFailed = false;
}

/** 向量缓存：存 meta 表（key = latent.vec:<id>），值为 { model, vec } */
export async function cachedVector(id: string, model: string): Promise<number[] | null> {
  const row = await db.get<{ key: string; value?: { model: string; vec: number[] } }>("meta", `latent.vec:${id}`);
  if (row?.value && row.value.model === model) return row.value.vec;
  return null;
}

export async function storeVector(id: string, model: string, vec: number[]) {
  await db.put("meta", { key: `latent.vec:${id}`, value: { model, vec } });
}

/**
 * 为一组文本准备稠密向量：优先云端（带缓存），失败回退稀疏。
 * 返回 { dense: Map<id, number[]> | null, sparse: Map<id, SparseVec> }——
 * 检索层有 dense 用 dense，否则用 sparse（Map  cosine）。
 */
export async function prepareVectors(
  cfg: EmbedConfig | null,
  items: { id: string; text: string }[]
): Promise<{ dense: Map<string, number[]> | null; sparse: Map<string, SparseVec> }> {
  const sparse = new Map<string, SparseVec>();
  for (const it of items) sparse.set(it.id, sparseEmbed(it.text));
  if (!cfg) return { dense: null, sparse };
  const dense = new Map<string, number[]>();
  const pending: { id: string; text: string }[] = [];
  for (const it of items) {
    const hit = await cachedVector(it.id, cfg.model);
    if (hit) dense.set(it.id, hit);
    else pending.push(it);
  }
  if (pending.length > 0) {
    const vecs = await cloudEmbed(cfg, pending.map((p) => p.text));
    if (vecs) {
      pending.forEach((p, i) => {
        dense.set(p.id, vecs[i]);
        void storeVector(p.id, cfg.model, vecs[i]);
      });
    } else {
      return { dense: null, sparse }; // 云端不可用：本次回退稀疏
    }
  }
  return { dense, sparse };
}

/**
 * 计算查询对每条记录的语义路分数（Map<recordId, 余弦分>）。
 * 配了云端 embedding 用稠密向量；没配或失败时回退 bigram 稀疏余弦——
 * 原版零依赖档语义路就是字符 bigram 余弦，与词面路高度重合，如实保留。
 */
export async function semanticScores(
  cfg: EmbedConfig | null,
  records: { id: string; title: string; body: string; status: string }[],
  query: string
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const textOf = (r: { title: string; body: string; status: string }) => `${r.title} ${r.body} ${r.status}`;
  if (!cfg) {
    const qv = sparseEmbed(query);
    for (const r of records) {
      const s = sparseCosine(qv, sparseEmbed(textOf(r)));
      if (s > 0) out.set(r.id, s);
    }
    return out;
  }
  const { dense, sparse } = await prepareVectors(cfg, records.map((r) => ({ id: r.id, text: textOf(r) })));
  let qv = queryVecCache.get(query);
  if (qv === undefined) qv = cacheQueryVec(query, (await cloudEmbed(cfg, [query]))?.[0] ?? null);
  if (dense && qv) {
    for (const [id, v] of dense) {
      if (v.length !== qv.length) continue;
      let dot = 0, qa = 0, va = 0;
      for (let i = 0; i < v.length; i++) {
        dot += qv[i] * v[i];
        qa += qv[i] * qv[i];
        va += v[i] * v[i];
      }
      if (qa === 0 || va === 0) continue;
      const cos = dot / (Math.sqrt(qa) * Math.sqrt(va));
      if (cos > 0) out.set(id, cos);
    }
    return out;
  }
  const qSparse = sparseEmbed(query);
  for (const r of records) {
    const sv = sparse.get(r.id);
    if (!sv) continue;
    const s = sparseCosine(qSparse, sv);
    if (s > 0) out.set(r.id, s);
  }
  return out;
}

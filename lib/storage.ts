// lib/storage.ts — saklar backend penyimpanan berkas (Fase 3 storage self-hosted).
//
// Dua backend hidup berdampingan PER BERKAS:
// - "supabase": Supabase Storage (bucket branding-docs / claim-docs), jalur lama.
// - "minio": MinIO di self-hosted server, satu bucket (default "fimo-files") dengan
//   key "<bucket-logis>/<storage_path>", diakses lewat Cloudflare Tunnel
//   (MINIO_ENDPOINT) memakai SigV4 yang ditandatangani di sini (WebCrypto,
//   tanpa dependensi baru).
//
// Penulisan baru mengikuti env STORAGE_BACKEND ("minio" | selain itu supabase).
// Setiap baris dokumen mencatat backend-nya di kolom storage_backend
// (migration 0011); baca/hapus WAJIB mengikuti kolom itu, bukan env.

import { createAdminClient } from "@/lib/supabase/admin";

export type StorageBackend = "supabase" | "minio";

export function activeStorageBackend(): StorageBackend {
  return process.env.STORAGE_BACKEND === "minio" ? "minio" : "supabase";
}

// ---------- util ----------

const enc = new TextEncoder();

function hex(bytes: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(bytes as ArrayBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const buf = typeof data === "string" ? enc.encode(data) : (data as Uint8Array);
  return hex(await crypto.subtle.digest("SHA-256", buf as BufferSource));
}

async function hmac(key: BufferSource, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, enc.encode(msg));
}

function minioConfig() {
  const endpoint = (process.env.MINIO_ENDPOINT ?? "").replace(/\/+$/, "");
  const accessKey = process.env.MINIO_ACCESS_KEY ?? "";
  const secretKey = process.env.MINIO_SECRET_KEY ?? "";
  const bucket = process.env.MINIO_BUCKET ?? "fimo-files";
  const region = process.env.MINIO_REGION ?? "us-east-1";
  return { endpoint, accessKey, secretKey, bucket, region };
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

async function signingKey(secret: string, date: string, region: string): Promise<ArrayBuffer> {
  const kDate = await hmac(enc.encode("AWS4" + secret) as BufferSource, date);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, "s3");
  return hmac(kService, "aws4_request");
}

function amzDates(now = new Date()): { ts: string; date: string } {
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  const date = `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}`;
  const ts = `${date}T${p(now.getUTCHours())}${p(now.getUTCMinutes())}${p(now.getUTCSeconds())}Z`;
  return { ts, date };
}

// ---------- MinIO (S3 SigV4) ----------

async function minioRequest(
  method: "PUT" | "DELETE",
  logicalBucket: string,
  path: string,
  body?: Uint8Array,
  contentType?: string,
): Promise<{ ok: boolean; error: string | null }> {
  const cfg = minioConfig();
  if (!cfg.endpoint || !cfg.accessKey || !cfg.secretKey)
    return { ok: false, error: "MINIO_* env belum diatur" };
  const host = new URL(cfg.endpoint).host;
  const key = `${logicalBucket}/${path}`;
  const payloadHash = await sha256Hex(body ?? new Uint8Array());
  const { ts, date } = amzDates();
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": ts,
  };
  if (contentType) headers["content-type"] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers).sort().map((h) => `${h}:${headers[h]}\n`).join("");
  const canonical = [method, `/${cfg.bucket}/${encodeKey(key)}`, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", ts, scope, await sha256Hex(canonical)].join("\n");
  const key_ = await signingKey(cfg.secretKey, date, cfg.region);
  const signature = hex(await hmac(key_, toSign));
  headers["Authorization"] =
    `AWS4-HMAC-SHA256 Credential=${cfg.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetch(`${cfg.endpoint}/${cfg.bucket}/${encodeKey(key)}`, {
    method,
    headers,
    body: body ? (body as BufferSource) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `MinIO ${method} ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: true, error: null };
}

async function minioSignedUrl(logicalBucket: string, path: string, expiresSec: number): Promise<string | null> {
  const cfg = minioConfig();
  if (!cfg.endpoint || !cfg.accessKey || !cfg.secretKey) return null;
  const host = new URL(cfg.endpoint).host;
  const key = `${logicalBucket}/${path}`;
  const { ts, date } = amzDates();
  const scope = `${date}/${cfg.region}/s3/aws4_request`;
  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKey}/${scope}`,
    "X-Amz-Date": ts,
    "X-Amz-Expires": String(expiresSec),
    "X-Amz-SignedHeaders": "host",
  };
  const query = Object.keys(params).sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");
  const canonical = ["GET", `/${cfg.bucket}/${encodeKey(key)}`, query, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const toSign = ["AWS4-HMAC-SHA256", ts, scope, await sha256Hex(canonical)].join("\n");
  const key_ = await signingKey(cfg.secretKey, date, cfg.region);
  const signature = hex(await hmac(key_, toSign));
  return `${cfg.endpoint}/${cfg.bucket}/${encodeKey(key)}?${query}&X-Amz-Signature=${signature}`;
}

// ---------- API terpadu ----------

export async function storageUpload(
  logicalBucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
  upsert: boolean,
): Promise<{ backend: StorageBackend; error: string | null }> {
  const backend = activeStorageBackend();
  if (backend === "minio") {
    const r = await minioRequest("PUT", logicalBucket, path, bytes, contentType);
    return { backend, error: r.ok ? null : r.error };
  }
  const admin = createAdminClient();
  const { error } = await admin.storage.from(logicalBucket).upload(path, bytes as BufferSource, {
    contentType,
    upsert,
  });
  return { backend, error: error ? error.message : null };
}

/** Hapus berkas dari backend tempat ia benar-benar tinggal. Best-effort. */
export async function storageRemove(
  backend: StorageBackend,
  logicalBucket: string,
  paths: string[],
): Promise<void> {
  if (!paths.length) return;
  if (backend === "minio") {
    for (const p of paths) await minioRequest("DELETE", logicalBucket, p).catch(() => null);
    return;
  }
  const admin = createAdminClient();
  await admin.storage.from(logicalBucket).remove(paths);
}

export async function storageSignedUrl(
  backend: StorageBackend,
  logicalBucket: string,
  path: string,
  expiresSec: number,
): Promise<string | null> {
  if (backend === "minio") return minioSignedUrl(logicalBucket, path, expiresSec);
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(logicalBucket).createSignedUrl(path, expiresSec);
  if (error || !data) return null;
  return data.signedUrl;
}

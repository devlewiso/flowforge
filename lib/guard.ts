/**
 * Request guards: endpoint allow-list (anti-SSRF), same-origin check (anti-CSRF),
 * per-IP rate limit and a one-line audit log. Server-only.
 */
import { isIP } from "node:net";

// ---------- Endpoints sent by the browser (Ollama / custom) ----------

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Extra hosts allowed for browser-supplied endpoints, e.g. "192.168.1.50,gpu-box.lan". */
function allowedHosts(): Set<string> {
  return new Set(
    (process.env.ALLOWED_ENDPOINT_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isLoopback(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (LOOPBACK_NAMES.has(h)) return true;
  return isIP(h) === 4 && h.startsWith("127.");
}

/**
 * A browser-supplied endpoint may only point at this machine (loopback) unless the
 * operator lists the host in ALLOWED_ENDPOINT_HOSTS. Exact hostname/IP match: no DNS,
 * so a name that later resolves elsewhere cannot sneak in.
 */
export function endpointHostAllowed(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return isLoopback(host) || allowedHosts().has(host);
}

// ---------- Same-origin check ----------

export type OriginVerdict = { ok: true } | { ok: false; reason: string };

/** Blocks cross-site requests: JSON only, and Origin / Sec-Fetch-Site must be same-origin. */
export function checkSameOrigin(request: Request): OriginVerdict {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\b/i.test(type)) {
    return { ok: false, reason: "content-type must be application/json" };
  }
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return { ok: false, reason: `sec-fetch-site=${site}` };
  }
  const origin = request.headers.get("origin");
  if (origin) {
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      return { ok: false, reason: "bad origin" };
    }
    if (!host || originHost.toLowerCase() !== host.toLowerCase()) {
      return { ok: false, reason: `origin ${originHost} != host ${host}` };
    }
  }
  return { ok: true };
}

// ---------- Rate limit (in memory, per process) ----------

const buckets = new Map<string, number[]>();

export function clientIp(request: Request): string {
  // Only trust proxy headers when running behind your own proxy (TRUST_PROXY=true).
  if (process.env.TRUST_PROXY === "true") {
    // Cloudflare sets CF-Connecting-IP itself; clients cannot spoof it through Cloudflare.
    const cf = request.headers.get("cf-connecting-ip")?.trim();
    if (cf) return cf;
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return "direct";
}

/** Sliding window. Returns seconds to wait, or 0 if allowed. */
export function rateLimit(key: string, limit: number, windowMs: number): number {
  if (limit <= 0) return 0;
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return Math.ceil((windowMs - (now - hits[0])) / 1000);
  }
  hits.push(now);
  buckets.set(key, hits);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return 0;
}

export function limitFromEnv(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 && process.env[name] !== undefined && process.env[name] !== "" ? n : fallback;
}

// ---------- Audit log (never the key, never the prompt) ----------

export interface AuditEntry {
  route: string;
  status: number;
  ms: number;
  ip: string;
  origin?: string | null;
  provider?: string;
  model?: string;
  keySource?: string;
  endpointHost?: string;
  reason?: string;
}

export function audit(entry: AuditEntry) {
  if (process.env.AUDIT_LOG === "false") return;
  console.info(`[audit] ${JSON.stringify({ t: new Date().toISOString(), ...entry })}`);
}

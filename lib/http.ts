import { NextResponse } from "next/server";
import { audit, checkSameOrigin, clientIp, rateLimit, type AuditEntry } from "./guard";
import { ProviderError, type ConnectionRequest } from "./llm";
import { isProviderId } from "./providers";
import type { ApiError, ConnectionBody } from "./types";

export function fail(status: number, error: string, code?: string, hint?: string) {
  return NextResponse.json<ApiError>({ error, code, hint }, { status, headers: { "Cache-Control": "no-store" } });
}

const str = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : undefined);

/** Reads the provider/model/key/baseUrl fields. The key is never logged or echoed back. */
export function parseConnection(body: ConnectionBody): ConnectionRequest | null {
  if (!isProviderId(body.provider)) return null;
  return {
    provider: body.provider,
    model: str(body.model, 200),
    apiKey: str(body.apiKey, 500),
    baseUrl: str(body.baseUrl, 500),
  };
}

export function providerErrorResponse(error: ProviderError) {
  const status: Record<ProviderError["code"], number> = {
    unauthorized: 401,
    bad_request: 400,
    model_not_found: 404,
    rate_limited: 429,
    timeout: 504,
    unreachable: 503,
    refused: 422,
    truncated: 502,
    empty: 502,
    http: 502,
  };
  return fail(status[error.code], error.message, error.code);
}

/**
 * Shared front door for the POST API routes: same-origin check and rate limit.
 * Returns a response to send right away, or null to continue.
 */
export function guardRequest(
  request: Request,
  route: string,
  limit: { max: number; windowMs: number },
  started: number,
): NextResponse | null {
  const ip = clientIp(request);
  const base: AuditEntry = { route, status: 0, ms: 0, ip, origin: request.headers.get("origin") };
  const origin = checkSameOrigin(request);
  if (!origin.ok) {
    audit({ ...base, status: 403, ms: Date.now() - started, reason: origin.reason });
    return fail(403, "Cross-site requests are not allowed.", "FORBIDDEN_ORIGIN");
  }
  const wait = rateLimit(`${route}:${ip}`, limit.max, limit.windowMs);
  if (wait > 0) {
    audit({ ...base, status: 429, ms: Date.now() - started, reason: "rate limit" });
    const res = fail(429, `Too many requests. Try again in ${wait}s.`, "RATE_LIMITED");
    res.headers.set("Retry-After", String(wait));
    return res;
  }
  return null;
}

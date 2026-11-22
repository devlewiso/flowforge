import { NextResponse } from "next/server";
import { listModels, ProviderError, resolveProvider } from "@/lib/llm";
import { fail, guardRequest, parseConnection, providerErrorResponse } from "@/lib/http";
import { audit, clientIp, limitFromEnv } from "@/lib/guard";
import type { ConnectionBody, ModelsResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Live model list for the chosen provider, using the user's key (or the server's). */
export async function POST(request: Request) {
  const started = Date.now();
  const blocked = guardRequest(request, "models", { max: limitFromEnv("RATE_LIMIT_MODELS", 30), windowMs: 10 * 60_000 }, started);
  if (blocked) return blocked;
  let body: ConnectionBody;
  try {
    body = (await request.json()) as ConnectionBody;
  } catch {
    return fail(400, "The request body is not valid JSON.", "BAD_BODY");
  }
  const connection = parseConnection(body);
  if (!connection) return fail(400, "Unknown provider.", "BAD_PROVIDER");

  const log = (status: number, extra: Record<string, unknown> = {}) =>
    audit({ route: "models", status, ms: Date.now() - started, ip: clientIp(request), origin: request.headers.get("origin"), provider: connection.provider, ...extra });

  try {
    const provider = resolveProvider({ ...connection, model: connection.model || "list" }, { listing: true });
    const models = await listModels(provider);
    log(200, { keySource: provider.keySource, endpointHost: provider.userEndpoint ? new URL(provider.baseUrl).host : undefined });
    return NextResponse.json<ModelsResponse>({ models: models.slice(0, 500) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ProviderError) {
      const res = providerErrorResponse(error);
      log(res.status, { reason: error.code });
      return res;
    }
    log(500, { reason: "internal" });
    return fail(500, "Could not load the model list.", "INTERNAL");
  }
}

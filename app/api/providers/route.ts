import { NextResponse } from "next/server";
import { customBaseUrlAllowed, providerStatuses } from "@/lib/llm";
import type { ProvidersResponse } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const providers = await providerStatuses().catch(() => []);
  return NextResponse.json<ProvidersResponse>(
    { providers, allowCustomBaseUrl: customBaseUrlAllowed() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Who runs this instance. Set these before going to production: the legal pages read them,
 * and `npm run check:prod` fails if the contact is missing. Nothing here is invented:
 * unset values are shown as "not configured" instead of a made-up placeholder.
 */
export const SITE = {
  name: "FlowForge",
  repo: "https://github.com/devlewiso/flowforge",
  operator: process.env.NEXT_PUBLIC_OPERATOR_NAME?.trim() || "NeuralCodeLab",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "",
  governingLaw: process.env.NEXT_PUBLIC_GOVERNING_LAW?.trim() || "",
  logRetentionDays: process.env.NEXT_PUBLIC_LOG_RETENTION_DAYS?.trim() || "",
  minimumAge: 16,
  effectiveDate: "November 20, 2026",
};

/** Official policy pages of each provider (checked 2026-11-20). */
export const PROVIDER_POLICIES = [
  {
    name: "OpenAI",
    terms: "https://openai.com/policies/terms-of-use",
    usage: "https://openai.com/policies/usage-policies",
    privacy: "https://openai.com/policies/privacy-policy",
  },
  {
    name: "Anthropic (Claude)",
    terms: "https://www.anthropic.com/legal/commercial-terms",
    usage: "https://www.anthropic.com/legal/aup",
    privacy: "https://www.anthropic.com/legal/privacy",
  },
  {
    name: "Google (Gemini API)",
    terms: "https://ai.google.dev/gemini-api/terms",
    usage: "https://ai.google.dev/gemini-api/terms",
    privacy: "https://policies.google.com/privacy",
  },
  { name: "OpenRouter", terms: "https://openrouter.ai/terms", usage: "https://openrouter.ai/terms", privacy: "https://openrouter.ai/privacy" },
  { name: "Groq", terms: "https://groq.com/terms-of-use", usage: "https://groq.com/terms-of-use", privacy: "https://groq.com/privacy-policy" },
] as const;

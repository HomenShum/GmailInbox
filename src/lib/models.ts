// Model ladder. Latest models as of 2026-Q2.
// Override any of these via env: see README.
//
// Tool-calling capable, ranked by quality/free-availability:
import { getWorkspaceSetting } from "./db";

export type Provider = "anthropic" | "openrouter" | "openai" | "google";

export interface ModelChoice { provider: Provider; model: string; free: boolean; }

// Default chain when only OPENROUTER_API_KEY is present.
// Picked from OpenRouter free tier (verified live April 2026):
//   openai/gpt-oss-120b:free                  131k ctx, native tool calling
//   qwen/qwen3-next-80b-a3b-instruct:free     262k ctx, strong tool calling
//   z-ai/glm-4.5-air:free                     131k ctx, decent
//   nvidia/nemotron-3-super-120b-a12b:free    262k ctx, reasoning-heavy
//   meta-llama/llama-3.3-70b-instruct:free    65k ctx, baseline
export const FREE_LADDER: ModelChoice[] = [
  { provider: "openrouter", model: "openai/gpt-oss-120b:free", free: true },
  { provider: "openrouter", model: "qwen/qwen3-next-80b-a3b-instruct:free", free: true },
  { provider: "openrouter", model: "z-ai/glm-4.5-air:free", free: true },
  { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free", free: true },
  { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", free: true },
];

// Premium chain for ANTHROPIC_API_KEY users (latest 4.x family, 2026-Q2).
export const PAID_LADDER: ModelChoice[] = [
  { provider: "anthropic", model: "claude-sonnet-4-6", free: false },
  { provider: "anthropic", model: "claude-haiku-4-5", free: false },
  { provider: "anthropic", model: "claude-opus-4-7", free: false },
];

export interface ResolvedConfig {
  provider: Provider;
  model: string;
  ladder: ModelChoice[];
  apiKeyVar: string;
}

export function resolveModel(): ResolvedConfig {
  const explicitProvider = (process.env.CHAT_PROVIDER as Provider | undefined);
  const explicitModel = process.env.CHAT_MODEL;

  if (explicitProvider && explicitModel) {
    const ladder = explicitProvider === "anthropic" ? PAID_LADDER : FREE_LADDER;
    return {
      provider: explicitProvider,
      model: explicitModel,
      ladder: [{ provider: explicitProvider, model: explicitModel, free: explicitProvider !== "anthropic" }, ...ladder],
      apiKeyVar: keyVarFor(explicitProvider),
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const preferred = getPreferredModel(PAID_LADDER);
    return { provider: preferred.provider, model: preferred.model, ladder: PAID_LADDER, apiKeyVar: keyVarFor(preferred.provider) };
  }
  if (process.env.OPENROUTER_API_KEY) {
    const preferred = getPreferredModel(FREE_LADDER);
    return { provider: preferred.provider, model: preferred.model, ladder: FREE_LADDER, apiKeyVar: keyVarFor(preferred.provider) };
  }
  // No keys — return openrouter free as the *intended* path; agent loop will surface a friendly error.
  const preferred = getPreferredModel(FREE_LADDER);
  return { provider: preferred.provider, model: preferred.model, ladder: FREE_LADDER, apiKeyVar: keyVarFor(preferred.provider) };
}

function getPreferredModel(ladder: ModelChoice[]): ModelChoice {
  const saved = getWorkspaceSetting<{ provider?: Provider; model?: string } | null>("model", null);
  if (!saved?.provider || !saved.model) return ladder[0];
  return ladder.find((choice) => choice.provider === saved.provider && choice.model === saved.model)
    ?? { provider: saved.provider, model: saved.model, free: saved.provider !== "anthropic" };
}

function keyVarFor(p: Provider): string {
  switch (p) {
    case "anthropic": return "ANTHROPIC_API_KEY";
    case "openrouter": return "OPENROUTER_API_KEY";
    case "openai": return "OPENAI_API_KEY";
    case "google": return "GEMINI_API_KEY";
  }
}

export function hasAnyKey(): boolean {
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY
  );
}

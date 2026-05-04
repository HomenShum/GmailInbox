import fs from "node:fs";
import path from "node:path";
import { buildCareerFitSummary } from "../src/lib/career-fit";
import { runNodeBenchJobResearch } from "../src/lib/nodebench/job-research";

type ProbeResult = {
  configured: boolean;
  reachable: boolean;
  url: string | null;
  error: string | null;
  transport: "mcp" | "rest" | "none";
  profile?: string;
  authMode?: string | null;
  accountKey?: string | null;
  costUnits?: string | null;
  estimatedUsd?: string | null;
  clientId?: string | null;
};

loadDotEnvLocal();

const requireLive = process.argv.includes("--require-live");
const requireMcp = process.argv.includes("--require-mcp");
const requireVerifiedResearch = process.argv.includes("--require-verified-research");
const probe = await probeNodeBench();
const summary = buildCareerFitSummary(1);
const top = summary.items[0];

if (!top) {
  fail("No career/job emails were available for NodeBench bridge verification.");
}

const research = await runNodeBenchJobResearch(top.email.id);
const preview = research.contextPack.requestPreview;

assert(preview.sendsRawEmailBody === false, "Bridge attempted to send raw email body.");
assert(preview.sendsRawResumeFile === false, "Bridge attempted to send raw resume file.");
assert(research.contextPack.useCase === "job_match", "Context pack use case must be job_match.");
assert(
  research.contextPack.nextNodeBenchTool.startsWith("nodebench."),
  "Context pack did not choose a NodeBench tool.",
);

if (requireLive && !probe.reachable) {
  fail(
    `NodeBench live mode was required, but ${probe.url ?? "NODEBENCH_API_URL"} is not reachable: ${probe.error ?? "unknown error"}`,
  );
}

if (requireMcp && (probe.transport !== "mcp" || !probe.reachable)) {
  fail(`Hosted NodeBench MCP was required, but it is not reachable: ${probe.error ?? "not configured"}`);
}

if (probe.reachable) {
  assert(
    research.contextPack.visibility === "nodebench_public",
    "NodeBench API is reachable, but Gmail did not store a public NodeBench context pack.",
  );
}

if (requireVerifiedResearch) {
  assert(research.status === "verified", "Verified public research was required, but the job is not verified.");
  assert((research.dossier?.sources.length ?? 0) > 0, "Verified public research was required, but no sources were returned.");
}

const report = {
  ok: true,
  mode: probe.reachable
    ? probe.transport === "mcp" ? "hosted_mcp_nodebench" : "rest_nodebench"
    : probe.configured ? "configured_but_unreachable" : "local_safe_fallback",
  nodebench: {
    transport: probe.transport,
    profile: probe.profile,
    authMode: probe.authMode,
    accountKey: probe.accountKey,
    costUnits: probe.costUnits,
    estimatedUsd: probe.estimatedUsd,
    clientId: probe.clientId,
    configured: probe.configured,
    reachable: probe.reachable,
    url: probe.url,
    error: probe.error,
  },
  email: {
    id: top.email.id,
    from: top.email.from_addr,
    subject: top.email.subject,
    fitScore: top.fitScore,
    fitLabel: top.fitLabel,
  },
  research: {
    status: research.status,
    visibility: research.contextPack.visibility,
    runId: research.runId,
    entityKey: research.entities.entityKey,
    company: research.entities.company,
    roleTitle: research.entities.roleTitle,
    nextTool: research.contextPack.nextNodeBenchTool,
    approvedArtifactSummaries: preview.approvedArtifactSummaries.length,
    sendsRawEmailBody: preview.sendsRawEmailBody,
    sendsRawResumeFile: preview.sendsRawResumeFile,
    error: research.error,
  },
};

console.log(JSON.stringify(report, null, 2));

async function probeNodeBench(): Promise<ProbeResult> {
  const mcp = nodeBenchMcpConfig();
  if (mcp) {
    const mcpProbe = await probeMcp(mcp);
    if (mcpProbe.reachable || !nodeBenchContextPackUrl()) return mcpProbe;
  }

  const url = nodeBenchContextPackUrl();
  if (!url) {
    return { configured: Boolean(mcp), reachable: false, url: mcp?.url ?? null, error: mcp?.error ?? "NodeBench is not configured.", transport: mcp ? "mcp" : "none", profile: mcp?.profile };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(url, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ entityKey: "company:openai.com", useCase: "job_match" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        configured: true,
        reachable: false,
        url,
        error: `HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`,
        transport: "rest",
      };
    }

    return { configured: true, reachable: true, url, error: null, transport: "rest" };
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      url,
      error: err instanceof Error ? err.message : String(err),
      transport: "rest",
    };
  }
}

async function probeMcp(config: { url: string; token: string | null; profile: string; clientId: string; error?: string }): Promise<ProbeResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(config.url, {
      method: "POST",
      headers: buildMcpHeaders(config),
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        configured: true,
        reachable: false,
        url: config.url,
        error: `HTTP ${response.status}${text ? `: ${text.slice(0, 160)}` : ""}`,
        transport: "mcp",
        profile: config.profile,
        clientId: config.clientId,
        ...mcpHeaders(response),
      };
    }

    const json = await response.json() as Record<string, unknown>;
    if (json.error) {
      return {
        configured: true,
        reachable: false,
        url: config.url,
        error: JSON.stringify(json.error).slice(0, 160),
        transport: "mcp",
        profile: config.profile,
        clientId: config.clientId,
        ...mcpHeaders(response),
      };
    }

    return {
      configured: true,
      reachable: true,
      url: config.url,
      error: null,
      transport: "mcp",
      profile: config.profile,
      clientId: config.clientId,
      ...mcpHeaders(response),
    };
  } catch (err) {
    return {
      configured: true,
      reachable: false,
      url: config.url,
      error: err instanceof Error ? err.message : String(err),
      transport: "mcp",
      profile: config.profile,
      clientId: config.clientId,
    };
  }
}

function nodeBenchMcpConfig() {
  const token = envValue("NODEBENCH_MCP_TOKEN")
    ?? envValue("NODEBENCH_GMAIL_RESEARCH_TOKEN")
    ?? envValue("NODEBENCH_PUBLIC_RESEARCH_TOKEN");
  const hasMcpEnv = Boolean(
    token
    || envValue("NODEBENCH_MCP_URL")
    || envValue("NODEBENCH_MCP_PROFILE")
    || envValue("NODEBENCH_MCP_CLIENT_ID"),
  );
  if (!hasMcpEnv) return null;
  const profile = envValue("NODEBENCH_MCP_PROFILE") || "gmail-research";
  const rawUrl = envValue("NODEBENCH_MCP_URL") || "https://nodebench-mcp-unified.onrender.com";
  const clientId = envValue("NODEBENCH_MCP_CLIENT_ID") || "gmail-dashboard-local";
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (!url.searchParams.has("profile")) url.searchParams.set("profile", profile);
    return { url: url.toString(), token, profile, clientId };
  } catch (err) {
    return { url: rawUrl, token, profile, clientId, error: err instanceof Error ? err.message : String(err) };
  }
}

function buildMcpHeaders(config: { token: string | null; clientId: string }) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-nodebench-client-id": config.clientId,
  };
  if (config.token) headers["x-mcp-token"] = config.token;
  return headers;
}

function mcpHeaders(response: Response) {
  return {
    authMode: response.headers.get("x-nodebench-auth-mode"),
    accountKey: response.headers.get("x-nodebench-account-key"),
    costUnits: response.headers.get("x-nodebench-cost-units"),
    estimatedUsd: response.headers.get("x-nodebench-estimated-usd"),
  };
}

function nodeBenchContextPackUrl() {
  const base = normalizedNodeBenchBaseUrl();
  return base ? `${base}/context/pack` : null;
}

function normalizedNodeBenchBaseUrl() {
  const raw = envValue("NODEBENCH_API_URL");
  if (!raw) return null;
  const trimmed = raw.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1/public-research")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/public-research`;
  return `${trimmed}/v1/public-research`;
}

function buildHeaders() {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const apiKey = envValue("NODEBENCH_API_KEY");
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }
  return headers;
}

function envValue(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

function loadDotEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) fail(message);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

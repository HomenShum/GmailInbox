import type { JobResearchEntities, NodeBenchContextPack, NodeBenchDossier, NodeBenchSourceRef } from "./job-research";

type NodeBenchRequestKind = "company" | "role";
type NodeBenchTransport = "mcp" | "rest";

type McpConfig = {
  url: string;
  token: string | null;
  profile: string;
  clientId: string;
};

export type NodeBenchPublicResearchResult = {
  status: "verified" | "queued" | "needs_review" | "failed";
  runId: string | null;
  dossier: NodeBenchDossier | null;
  contextPack: NodeBenchContextPack | null;
  error: string | null;
};

export function isNodeBenchConfigured() {
  return Boolean(mcpGatewayConfig() || publicResearchBaseUrl());
}

export async function requestNodeBenchJobContext(
  entities: JobResearchEntities,
  localContextPack: NodeBenchContextPack,
): Promise<NodeBenchPublicResearchResult> {
  const kind: NodeBenchRequestKind = entities.roleTitle && (entities.company || entities.domain) ? "role" : "company";
  const mcpConfig = mcpGatewayConfig();
  const restBaseUrl = publicResearchBaseUrl();

  if (!mcpConfig && !restBaseUrl) {
    return {
      status: "needs_review",
      runId: null,
      dossier: null,
      contextPack: null,
      error: "NodeBench is not connected yet. Local request packet is ready for public-source research.",
    };
  }

  if (mcpConfig) {
    try {
      return await requestMcpJobContext(mcpConfig, entities, localContextPack, kind);
    } catch (err) {
      if (!restBaseUrl) return localUnavailableResult(localContextPack, err, "NodeBench MCP request failed before returning a context pack.");
      const fallbackPack = appendContextNote(localContextPack, "Hosted NodeBench MCP failed, so Gmail retried the local REST research API.");
      try {
        return await requestRestJobContext(restBaseUrl, entities, fallbackPack, kind);
      } catch (restErr) {
        return localUnavailableResult(fallbackPack, restErr, "NodeBench REST fallback also failed before returning a context pack.");
      }
    }
  }

  try {
    return await requestRestJobContext(restBaseUrl as string, entities, localContextPack, kind);
  } catch (err) {
    return localUnavailableResult(localContextPack, err, "NodeBench public research did not return a reusable context pack yet.");
  }
}

async function requestMcpJobContext(
  config: McpConfig,
  entities: JobResearchEntities,
  localContextPack: NodeBenchContextPack,
  kind: NodeBenchRequestKind,
): Promise<NodeBenchPublicResearchResult> {
  const goal = buildGoal(entities);
  const payload = kind === "role"
    ? await callMcpTool(config, "nodebench.research_role", {
      roleTitle: entities.roleTitle,
      companyName: entities.company ?? undefined,
      senderDomain: entities.domain ?? undefined,
      recruiterName: entities.person ?? undefined,
      jobUrl: entities.jobUrl ?? undefined,
      useCase: "job_match",
      goal,
      privateBoundary: "Public-safe signals only. Raw Gmail bodies, raw resumes, private notes, private scoring, and personal preferences remain in Gmail.",
    })
    : await callMcpTool(config, "nodebench.research_company", {
      companyName: entities.company ?? entities.domain ?? "Unknown company",
      domain: publicCompanyDomain(entities),
      senderDomain: entities.domain ?? undefined,
      useCase: "job_match",
      goal,
      privateBoundary: "Public-safe signals only. Private scoring remains in Gmail.",
    });

  const mapped = mapNodeBenchResponse(payload, entities, localContextPack, kind, "mcp");
  if (kind === "role" && shouldTryCompanyFallback(mapped, entities)) {
    const companyPayload = await callMcpTool(config, "nodebench.research_company", {
      companyName: entities.company ?? entities.domain ?? "Unknown company",
      domain: publicCompanyDomain(entities),
      senderDomain: entities.domain ?? undefined,
      useCase: "job_match",
      goal: `Public company context for job match: ${entities.company ?? entities.domain ?? "Unknown company"}`,
      privateBoundary: "Public-safe signals only. Private scoring remains in Gmail.",
    });
    return mapNodeBenchResponse(
      companyPayload,
      entities,
      appendContextNote(localContextPack, "Hosted MCP role research returned no sourced claims, so Gmail retried company research."),
      "company",
      "mcp",
    );
  }

  return mapped;
}

async function requestRestJobContext(
  baseUrl: string,
  entities: JobResearchEntities,
  localContextPack: NodeBenchContextPack,
  kind: NodeBenchRequestKind,
): Promise<NodeBenchPublicResearchResult> {
  const goal = buildGoal(entities);
  const payload = kind === "role"
    ? await postNodeBenchRest(`${baseUrl}/research/role`, {
      roleTitle: entities.roleTitle,
      companyName: entities.company ?? entities.domain,
      goal,
    })
    : await postNodeBenchRest(`${baseUrl}/research/company`, {
      companyName: entities.company ?? entities.domain ?? "Unknown company",
      domain: publicCompanyDomain(entities),
      visibility: "private_guided",
      goal,
    });

  const mapped = mapNodeBenchResponse(payload, entities, localContextPack, kind, "rest");
  if (kind === "role" && shouldTryCompanyFallback(mapped, entities)) {
    const companyPayload = await postNodeBenchRest(`${baseUrl}/research/company`, {
      companyName: entities.company ?? entities.domain ?? "Unknown company",
      domain: publicCompanyDomain(entities),
      visibility: "private_guided",
      goal: `Public company context for job match: ${entities.company ?? entities.domain ?? "Unknown company"}`,
    });
    return mapNodeBenchResponse(
      companyPayload,
      entities,
      appendContextNote(localContextPack, "Role research returned no sourced public claims, so Gmail retried NodeBench company research for the same job."),
      "company",
      "rest",
    );
  }

  return mapped;
}

function localUnavailableResult(localContextPack: NodeBenchContextPack, err: unknown, note: string): NodeBenchPublicResearchResult {
  return {
    status: "needs_review",
    runId: null,
    dossier: null,
    contextPack: {
      ...appendContextNote(localContextPack, note),
      visibility: "local_stub",
    },
    error: err instanceof Error ? err.message : String(err),
  };
}

function shouldTryCompanyFallback(result: NodeBenchPublicResearchResult, entities: JobResearchEntities) {
  if (!entities.company && !entities.domain) return false;
  if (result.status === "verified" || result.status === "queued") return false;
  if (result.error) return false;
  const noSources = (result.dossier?.sources.length ?? 0) === 0;
  const noClaims = result.dossier?.missingInfo.some((item) => /no verified public claims|no verified public dossier/i.test(item)) ?? false;
  return noSources && noClaims;
}

function publicCompanyDomain(entities: JobResearchEntities) {
  if (!entities.domain || GENERIC_SOURCE_DOMAINS.has(entities.domain)) return undefined;
  return entities.domain;
}

function mcpGatewayConfig(): McpConfig | null {
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
  const url = withProfile(rawUrl, profile);
  return { url, token, profile, clientId };
}

function withProfile(rawUrl: string, profile: string) {
  const url = new URL(rawUrl);
  if (!url.searchParams.has("profile")) url.searchParams.set("profile", profile);
  return url.toString();
}

function publicResearchBaseUrl() {
  const raw = envValue("NODEBENCH_API_URL");
  if (!raw) return null;
  const trimmed = raw.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1/public-research")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/public-research`;
  return `${trimmed}/v1/public-research`;
}

async function callMcpTool(config: McpConfig, toolName: string, args: Record<string, unknown>) {
  const response = await fetchWithNodeBenchTimeout(config.url, {
    method: "POST",
    headers: buildMcpHeaders(config),
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `gmail_${Date.now()}`,
      method: "tools/call",
      params: { name: toolName, arguments: stripUndefined(args) },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`NodeBench MCP request failed (${response.status})${text ? `: ${text.slice(0, 240)}` : ""}`);
  }

  const json = await response.json() as Record<string, unknown>;
  const error = getObject(json.error);
  if (error) {
    throw new Error(stringValue(error.message) ?? `NodeBench MCP error: ${JSON.stringify(error).slice(0, 240)}`);
  }
  return attachMcpMeta(normalizeMcpResult(json), mcpMetaFromResponse(response, json, config));
}

async function postNodeBenchRest(url: string, body: Record<string, unknown>) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const apiKey = envValue("NODEBENCH_API_KEY");
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }

  const response = await fetchWithNodeBenchTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(stripUndefined(body)),
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`NodeBench REST request failed (${response.status})${text ? `: ${text.slice(0, 240)}` : ""}`);
  }

  return response.json() as Promise<Record<string, unknown>>;
}

function buildMcpHeaders(config: McpConfig) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-nodebench-client-id": config.clientId,
  };
  if (config.token) headers["x-mcp-token"] = config.token;
  return headers;
}

function mcpMetaFromResponse(response: Response, json: Record<string, unknown>, config: McpConfig) {
  const result = getObject(json.result);
  const resultMeta = getObject(getObject(result?._meta)?.nodebench);
  const meta: Record<string, unknown> = {
    ...(resultMeta ?? {}),
    profile: response.headers.get("x-nodebench-profile") ?? resultMeta?.profile ?? config.profile,
    authMode: response.headers.get("x-nodebench-auth-mode") ?? resultMeta?.authMode ?? resultMeta?.auth_mode ?? (config.token ? "token" : "anonymous"),
    accountKey: response.headers.get("x-nodebench-account-key") ?? resultMeta?.accountKey ?? resultMeta?.account_key,
    costUnits: response.headers.get("x-nodebench-cost-units") ?? resultMeta?.costUnits ?? resultMeta?.cost_units,
    estimatedUsd: response.headers.get("x-nodebench-estimated-usd") ?? resultMeta?.estimatedUsd ?? resultMeta?.estimated_usd,
    requestId: response.headers.get("x-nodebench-request-id") ?? resultMeta?.requestId ?? resultMeta?.request_id,
    clientId: config.clientId,
  };
  const cleaned = stripUndefined(meta);
  return Object.keys(cleaned).length ? cleaned : null;
}

function attachMcpMeta(payload: Record<string, unknown>, meta: Record<string, unknown> | null) {
  if (!meta) return payload;
  const currentMeta = getObject(payload._meta) ?? {};
  const currentNodeBench = getObject(currentMeta.nodebench) ?? {};
  return {
    ...payload,
    _meta: {
      ...currentMeta,
      nodebench: {
        ...currentNodeBench,
        ...meta,
      },
    },
  };
}

function normalizeMcpResult(json: Record<string, unknown>): Record<string, unknown> {
  const result = getObject(json.result) ?? json;
  const structured = getObject(result.structuredContent) ?? getObject(result.structured_content);
  if (structured) return structured;

  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content) {
    const object = getObject(item);
    const text = stringValue(object?.text);
    if (!text) continue;
    const parsed = parseJsonObject(text);
    if (parsed) return parsed;
    return { summary: text };
  }

  return result;
}

function mapNodeBenchResponse(
  payload: Record<string, unknown>,
  entities: JobResearchEntities,
  localContextPack: NodeBenchContextPack,
  kind: NodeBenchRequestKind,
  transport: NodeBenchTransport,
): NodeBenchPublicResearchResult {
  const remotePack = getObject(payload.contextPack) ?? getObject(payload.context_pack) ?? getObject(getObject(payload.dossier)?.contextPack);
  const remoteDossier = getObject(payload.dossier) ?? getObject(payload.entity) ?? payload;
  const now = Math.floor(Date.now() / 1000);
  const summary = stringValue(remotePack?.summary) ?? stringValue(remoteDossier.summary) ?? stringValue(payload.summary)
    ?? `NodeBench returned public research context for ${entities.company ?? entities.domain ?? "this company"}.`;
  const signals = stringArray(remotePack?.signals).length ? stringArray(remotePack?.signals) : stringArray(remoteDossier.publicSignals ?? remoteDossier.signals);
  const risks = stringArray(remotePack?.risks).length ? stringArray(remotePack?.risks) : stringArray(remoteDossier.risks);
  const missingInfo = stringArray(remotePack?.missing_info ?? remotePack?.missingInfo).length
    ? stringArray(remotePack?.missing_info ?? remotePack?.missingInfo)
    : stringArray(remoteDossier.missing_info ?? remoteDossier.missingInfo);
  const sources = mapSources(remotePack?.sources ?? remoteDossier.sources ?? payload.sources);
  const entityKey = stringValue(remotePack?.entity_key ?? remotePack?.entityKey ?? remoteDossier.entity_key ?? remoteDossier.entityKey)
    ?? `company:${entities.entityKey}`;
  const latestRun = latestRunObject(remoteDossier.runs);
  const runId = stringValue(payload.runId ?? payload.run_id ?? remoteDossier.runId ?? remoteDossier.run_id ?? latestRun?.researchRunId ?? latestRun?.research_run_id);
  const upstreamError = nodeBenchError(payload, remoteDossier, latestRun);
  const status = mapStatus(payload.status ?? remoteDossier.status ?? latestRun?.status, sources, summary, missingInfo, upstreamError);
  const mcpMeta = nodeBenchMeta(payload);
  const meteringNote = transport === "mcp" && mcpMeta ? mcpMeteringNote(mcpMeta) : null;

  const contextPack: NodeBenchContextPack = {
    ...localContextPack,
    visibility: "nodebench_public",
    nextNodeBenchTool: nextToolName(kind, transport),
    notes: [
      `${transport === "mcp" ? "Hosted MCP" : "REST"} NodeBench returned a public research context pack.`,
      ...(meteringNote ? [meteringNote] : []),
      stringValue(remotePack?.private_boundary ?? remotePack?.privateBoundary)
        ?? "Public pack only. Private fit scoring remains in Gmail.",
      "Raw Gmail body and raw resume files were not included in the request.",
      ...localContextPack.notes.filter((note) => !/Raw Gmail body/.test(note)),
    ].slice(0, 8),
  };

  return {
    status,
    runId,
    contextPack,
    dossier: {
      entityId: entityKey,
      headline: stringValue(remoteDossier.headline) ?? `${entities.company ?? entities.domain ?? "Company"} / ${entities.roleTitle ?? "role context"}`,
      summary,
      publicSignals: signals,
      risks: upstreamError ? [`NodeBench upstream run failed: ${clip(upstreamError, 180)}`, ...risks].slice(0, 8) : risks,
      missingInfo,
      sources,
      freshness: status === "verified" ? "fresh" : "stale",
      generatedAt: now,
    },
    error: upstreamError,
  };
}

function nextToolName(kind: NodeBenchRequestKind, transport: NodeBenchTransport): NodeBenchContextPack["nextNodeBenchTool"] {
  if (transport === "mcp") return kind === "role" ? "nodebench.research_role" : "nodebench.research_company";
  return kind === "role" ? "nodebench.research.role" : "nodebench.research.company";
}

function buildGoal(entities: JobResearchEntities) {
  const company = entities.company ?? entities.domain ?? "target company";
  return entities.roleTitle
    ? `Public job-match context for ${entities.roleTitle} at ${company}`
    : `Public job-match context for ${company}`;
}

function mapStatus(
  value: unknown,
  sources: NodeBenchSourceRef[],
  summary: string,
  missingInfo: string[],
  upstreamError: string | null,
): NodeBenchPublicResearchResult["status"] {
  if (upstreamError) return "failed";
  const normalized = stringValue(value)?.toLowerCase();
  if (normalized === "queued" || normalized === "searching" || normalized === "extracting" || normalized === "researching") return "queued";
  if (normalized === "failed" || normalized === "error") return "failed";
  if (normalized === "needs_review") return "needs_review";
  if (sources.length === 0 || /no verified public dossier/i.test(summary) || missingInfo.some((item) => /no verified public claims/i.test(item))) {
    return "needs_review";
  }
  return "verified";
}

function mapSources(value: unknown): NodeBenchSourceRef[] {
  if (!Array.isArray(value)) return [];
  const out: NodeBenchSourceRef[] = [];
  value.slice(0, 8).forEach((source, index) => {
    const object = getObject(source);
    if (!object) return;
    const url = stringValue(object.url ?? object.sourceUrl ?? object.source_url);
    if (!url) return;
    out.push({
      title: stringValue(object.title ?? object.sourceTitle ?? object.source_title) ?? `NodeBench source ${index + 1}`,
      url,
      type: "nodebench_public_source",
    });
  });
  return out;
}

function appendContextNote(contextPack: NodeBenchContextPack, note: string): NodeBenchContextPack {
  return { ...contextPack, notes: [...contextPack.notes, note] };
}

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => typeof item === "string" ? item : stringValue(getObject(item)?.text ?? getObject(item)?.claim))
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .slice(0, 8);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function latestRunObject(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return null;
  return getObject(value[0]);
}

function nodeBenchError(
  payload: Record<string, unknown>,
  remoteDossier: Record<string, unknown>,
  latestRun: Record<string, unknown> | null,
) {
  return stringValue(payload.error)
    ?? stringValue(remoteDossier.error)
    ?? stringValue(latestRun?.error)
    ?? null;
}

function nodeBenchMeta(payload: Record<string, unknown>) {
  return getObject(getObject(payload._meta)?.nodebench);
}

function mcpMeteringNote(meta: Record<string, unknown>) {
  const authMode = stringValue(meta.authMode ?? meta.auth_mode) ?? "anonymous";
  const profile = stringValue(meta.profile) ?? "gmail-research";
  const accountKey = stringValue(meta.accountKey ?? meta.account_key);
  const costUnits = stringValue(meta.costUnits ?? meta.cost_units);
  const estimatedUsd = stringValue(meta.estimatedUsd ?? meta.estimated_usd);
  const parts = [`${authMode} ${profile}`];
  if (accountKey) parts.push(`account ${clip(accountKey, 36)}`);
  if (costUnits) parts.push(`${costUnits} cost units`);
  if (estimatedUsd) parts.push(`$${estimatedUsd} estimated`);
  return `NodeBench MCP metering: ${parts.join(" / ")}.`;
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const objectSlice = withoutFence.includes("{") && withoutFence.includes("}")
    ? withoutFence.slice(withoutFence.indexOf("{"), withoutFence.lastIndexOf("}") + 1)
    : withoutFence;
  for (const candidate of [trimmed, withoutFence, objectSlice]) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      const object = getObject(parsed);
      if (object) return object;
    } catch {
      // Try the next representation.
    }
  }
  return null;
}

function clip(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function envValue(name: string) {
  const value = process.env[name]?.trim();
  return value || null;
}

async function fetchWithNodeBenchTimeout(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), nodeBenchRequestTimeoutMs());
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function nodeBenchRequestTimeoutMs() {
  const raw = Number(envValue("NODEBENCH_REQUEST_TIMEOUT_MS"));
  if (Number.isFinite(raw) && raw >= 5_000) return Math.min(raw, 120_000);
  return 45_000;
}

const GENERIC_SOURCE_DOMAINS = new Set(["linkedin.com", "indeed.com", "wellfound.com", "glassdoor.com", "greenhouse.io", "lever.co", "workday.com"]);

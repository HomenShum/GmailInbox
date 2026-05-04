import crypto from "node:crypto";
import { getEmail, listJobResearchContexts, upsertJobResearchContext, type JobResearchContextRow, type JobResearchStatus, type LaneCard } from "@/lib/db";
import { requestNodeBenchJobContext } from "./client";
import { getPinnedContextSummary } from "@/lib/pinned-artifacts";

export type JobResearchEntities = {
  company: string | null;
  roleTitle: string | null;
  person: string | null;
  domain: string | null;
  jobUrl: string | null;
  location: string | null;
  compRange: string | null;
  entityKey: string;
  confidence: number;
};

export type NodeBenchSourceRef = {
  title: string;
  url: string;
  type: "job_url" | "company_domain" | "nodebench_public_claim" | "nodebench_public_source" | "local_stub";
};

export type NodeBenchDossier = {
  entityId: string;
  headline: string;
  summary: string;
  publicSignals: string[];
  risks: string[];
  missingInfo: string[];
  sources: NodeBenchSourceRef[];
  freshness: "fresh" | "stale" | "local_stub";
  generatedAt: number;
};

export type NodeBenchContextPack = {
  useCase: "job_match";
  visibility: "local_stub" | "nodebench_public";
  requestPreview: {
    company: string | null;
    roleTitle: string | null;
    person: string | null;
    domain: string | null;
    jobUrl: string | null;
    approvedArtifactSummaries: Array<{ id: string; name: string; summary: string | null }>;
    sendsRawEmailBody: false;
    sendsRawResumeFile: false;
  };
  nextNodeBenchTool:
    | "nodebench.entities.resolve"
    | "nodebench.research.company"
    | "nodebench.research.role"
    | "nodebench.research_company"
    | "nodebench.research_role"
    | "nodebench.context.pack"
    | "nodebench.get_matching_context";
  notes: string[];
};

export type JobResearchView = {
  status: JobResearchStatus;
  runId: string | null;
  entities: JobResearchEntities;
  dossier: NodeBenchDossier | null;
  contextPack: NodeBenchContextPack;
  error: string | null;
  updatedAt: number | null;
  expiresAt: number | null;
};

export function buildResearchView(email: LaneCard, row?: JobResearchContextRow | null): JobResearchView {
  const fallbackEntities = extractJobResearchEntities(email);
  if (!row) {
    return {
      status: "not_started",
      runId: null,
      entities: fallbackEntities,
      dossier: null,
      contextPack: buildContextPack(fallbackEntities),
      error: null,
      updatedAt: null,
      expiresAt: null,
    };
  }

  const entities = parseJson<JobResearchEntities>(row.entities_json) ?? fallbackEntities;
  return {
    status: normalizeStatus(row.status),
    runId: row.run_id,
    entities,
    dossier: parseJson<NodeBenchDossier>(row.dossier_json),
    contextPack: parseJson<NodeBenchContextPack>(row.context_pack_json) ?? buildContextPack(entities),
    error: row.error,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

export function getResearchViewMap(emails: LaneCard[]) {
  const rows = listJobResearchContexts(emails.map((email) => email.id));
  return Object.fromEntries(emails.map((email) => [email.id, buildResearchView(email, rows[email.id])]));
}

export async function runNodeBenchJobResearch(emailId: string): Promise<JobResearchView> {
  const email = getEmail(emailId);
  if (!email) throw new Error("email not found");

  const entities = extractJobResearchEntities(email);
  const contextPack = buildContextPack(entities);
  const now = Math.floor(Date.now() / 1000);
  const remote = await requestNodeBenchJobContext(entities, contextPack);
  const runId = remote.runId ?? `nb_local_${hash(`${email.id}:${entities.entityKey}:${now}`).slice(0, 12)}`;
  const dossier = remote.dossier ?? buildLocalDossier(entities, remote.contextPack ?? contextPack, now);
  const finalContextPack = remote.contextPack ?? contextPack;

  const row = upsertJobResearchContext({
    email_id: email.id,
    status: remote.status,
    run_id: runId,
    entity_key: entities.entityKey,
    entities_json: JSON.stringify(entities),
    dossier_json: JSON.stringify(dossier),
    context_pack_json: JSON.stringify(finalContextPack),
    error: remote.error,
    requested_at: now,
    expires_at: now + (remote.status === "verified" ? 14 : 7) * 86_400,
  });

  return buildResearchView(email, row);
}

export function extractJobResearchEntities(email: LaneCard): JobResearchEntities {
  const subject = clean(email.subject);
  const snippet = clean(email.snippet);
  const fromName = clean(email.from_name ?? "");
  const domain = extractDomain(email.from_addr);
  const roleTitle = inferRoleTitle(subject, snippet);
  const company = inferCompany(subject, snippet, fromName, domain);
  const person = inferPerson(fromName);
  const jobUrl = extractUrl(`${email.snippet} ${email.body ?? ""}`);
  const location = extractLocation(`${subject} ${snippet}`);
  const compRange = extractCompRange(`${subject} ${snippet}`);
  const confidence = clamp(
    0.35
      + (company ? 0.2 : 0)
      + (roleTitle ? 0.18 : 0)
      + (domain && !GENERIC_DOMAINS.has(domain) ? 0.12 : 0)
      + (jobUrl ? 0.1 : 0),
    0.1,
    0.95,
  );

  return {
    company,
    roleTitle,
    person,
    domain,
    jobUrl,
    location,
    compRange,
    entityKey: entityKey(company, domain, roleTitle),
    confidence: Math.round(confidence * 100) / 100,
  };
}

function buildContextPack(entities: JobResearchEntities): NodeBenchContextPack {
  const context = getPinnedContextSummary();
  return {
    useCase: "job_match",
    visibility: "local_stub",
    requestPreview: {
      company: entities.company,
      roleTitle: entities.roleTitle,
      person: entities.person,
      domain: entities.domain,
      jobUrl: entities.jobUrl,
      approvedArtifactSummaries: context.artifacts
        .filter((artifact) => artifact.approved_for_external_research)
        .map((artifact) => ({ id: artifact.id, name: artifact.name, summary: artifact.summary }))
        .slice(0, 3),
      sendsRawEmailBody: false,
      sendsRawResumeFile: false,
    },
    nextNodeBenchTool: entities.roleTitle && (entities.company || entities.domain)
      ? "nodebench.research.role"
      : entities.company || entities.domain ? "nodebench.research.company" : "nodebench.entities.resolve",
    notes: [
      "Prepared from email metadata, subject/snippet-derived entities, and pinned artifact policy.",
      "Raw Gmail body and raw resume files are not included in the NodeBench request preview.",
      "Public claims should be stored in NodeBench only when backed by public source URLs.",
    ],
  };
}

function buildLocalDossier(entities: JobResearchEntities, contextPack: NodeBenchContextPack, now: number): NodeBenchDossier {
  const companyLabel = entities.company ?? entities.domain ?? "Unknown company";
  const roleLabel = entities.roleTitle ?? "target role";
  const sources: NodeBenchSourceRef[] = [];
  if (entities.jobUrl) sources.push({ title: "Job URL from email", url: entities.jobUrl, type: "job_url" });
  if (entities.domain && !GENERIC_DOMAINS.has(entities.domain)) sources.push({ title: `${companyLabel} domain`, url: `https://${entities.domain}`, type: "company_domain" });
  sources.push({ title: "Local NodeBench request packet", url: "local://nodebench/request-preview", type: "local_stub" });

  return {
    entityId: `entity:${entities.entityKey}`,
    headline: `${companyLabel} / ${roleLabel}`,
    summary: `Prepared a NodeBench research packet for ${companyLabel}. Real public-source enrichment should resolve the entity, fetch public sources, verify claims, and return a reusable dossier.`,
    publicSignals: [
      entities.roleTitle ? `Role target: ${entities.roleTitle}` : "Role title needs extraction review",
      entities.domain ? `Sender/domain hint: ${entities.domain}` : "No reliable company domain found",
      contextPack.requestPreview.approvedArtifactSummaries.length
        ? `${contextPack.requestPreview.approvedArtifactSummaries.length} artifact summaries approved for external research`
        : "No pinned artifact summaries approved for external research",
    ],
    risks: [
      "Company/person facts are not public-verified yet.",
      "LinkedIn or alert emails may hide the true hiring company.",
    ],
    missingInfo: [
      entities.company ? "Verify canonical company entity and aliases" : "Confirm company name",
      "Fetch official company/careers/profile sources",
      "Check recent hiring, product, funding, and role context",
    ],
    sources,
    freshness: "local_stub",
    generatedAt: now,
  };
}

function inferRoleTitle(subject: string, snippet: string) {
  const text = `${subject} ${snippet}`;
  const atMatch = text.match(/(?:^|jobs?:?\s*)([^|:;,.]{5,90}?(?:engineer|developer|designer|manager|analyst|scientist|lead|founder|operator|architect|researcher|consultant|specialist)[^|:;,.]{0,80}?)(?:\s+(?:at|@|with)\s+)/i);
  if (atMatch?.[1]) return titleCase(trimRole(atMatch[1]));
  const pipeMatch = text.match(/([^|]{4,90}?(?:engineer|developer|designer|manager|analyst|scientist|lead|researcher|operator|consultant|specialist)[^|]{0,80}?)(?:\s*[|,-]\s*)/i);
  if (pipeMatch?.[1]) return titleCase(trimRole(pipeMatch[1]));
  return null;
}

function inferCompany(subject: string, snippet: string, fromName: string, domain: string | null) {
  for (const source of [subject, snippet]) {
    const atMatch = source.match(/\b(?:at|@|with)\s+([^|,.;:!()\n]{2,60})(?:$|\s-\s|[|,.;:!()])/i);
    const candidate = cleanCompany(atMatch?.[1] ?? null);
    if (candidate) return candidate;
  }
  const fromCompany = cleanCompany(fromName);
  if (fromCompany && !GENERIC_SENDERS.has(fromCompany.toLowerCase())) return fromCompany;
  if (domain && !GENERIC_DOMAINS.has(domain)) return titleCase(domain.split(".")[0].replace(/[-_]+/g, " "));
  return null;
}

function inferPerson(fromName: string) {
  const name = clean(fromName);
  if (!name || GENERIC_SENDERS.has(name.toLowerCase())) return null;
  if (/jobs|alerts|team|support|noreply|notifications|linkedin|indeed|wellfound/i.test(name)) return null;
  return name;
}

function extractDomain(addr: string) {
  const match = addr.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/);
  return match?.[1] ?? null;
}

function extractUrl(value: string) {
  const match = value.match(/https?:\/\/[^\s<>"')]+/i);
  return match?.[0]?.replace(/[.,;]+$/, "") ?? null;
}

function extractLocation(value: string) {
  const match = value.match(/\b(remote|hybrid|san francisco|bay area|new york|nyc|seattle|austin|boston|los angeles|united states|canada)\b/i);
  return match ? titleCase(match[1]) : null;
}

function extractCompRange(value: string) {
  const match = value.match(/\$?\d{2,3}\s?k\s*(?:-|to)\s*\$?\d{2,3}\s?k/i);
  return match?.[0].replace(/\s+/g, "") ?? null;
}

function entityKey(company: string | null, domain: string | null, role: string | null) {
  const basis = company ?? domain ?? role ?? "unknown";
  return slug(basis);
}

function trimRole(value: string) {
  return value
    .replace(/\b(new jobs?|job alert|hiring|we'?re|your application to|re:)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}

function cleanCompany(value: string | null) {
  const cleaned = clean(value ?? "")
    .replace(/\b(jobs?|careers?|alerts?|recruiting|talent|team|support|notifications|noreply)\b/gi, " ")
    .replace(/\b(engineer|developer|designer|manager|analyst|scientist|lead|researcher|operator|consultant|specialist|remote|opportunity|role|application)\b.*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[|,.;:!-]+$/, "");
  if (!cleaned || cleaned.length < 2) return null;
  const words = cleaned.split(/\s+/);
  const deduped = words.filter((word, index) => index === 0 || word.toLowerCase() !== words[index - 1].toLowerCase());
  return titleCase(deduped.slice(0, 4).join(" ").slice(0, 60));
}

function titleCase(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (ACRONYMS.has(part.toLowerCase()) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

function clean(value: string) {
  return value.replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "unknown";
}

function hash(value: string) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeStatus(status: string): JobResearchStatus {
  return RESEARCH_STATUSES.has(status as JobResearchStatus) ? status as JobResearchStatus : "failed";
}

const RESEARCH_STATUSES = new Set<JobResearchStatus>(["not_started", "queued", "researching", "verified", "stale", "needs_review", "failed"]);
const ACRONYMS = new Set(["ai", "ml", "nlp", "llm", "api", "fde", "yc", "cto", "cio"]);
const GENERIC_DOMAINS = new Set(["linkedin.com", "indeed.com", "wellfound.com", "glassdoor.com", "greenhouse.io", "lever.co", "workday.com"]);
const GENERIC_SENDERS = new Set(["linkedin", "linkedin job alerts", "indeed", "wellfound", "greenhouse", "lever", "workday", "jobs", "job alerts"]);

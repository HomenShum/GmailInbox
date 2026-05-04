import fs from "node:fs";
import path from "node:path";
import { buildCareerFitSummary } from "../src/lib/career-fit";
import { runNodeBenchJobResearch, type JobResearchView } from "../src/lib/nodebench/job-research";

loadDotEnvLocal();

const limit = numberArg("--limit", 40);
const concurrency = Math.max(1, Math.min(numberArg("--concurrency", 2), 4));
const onlyMissing = flagArg("--only-missing");
const summary = buildCareerFitSummary(limit);
const allJobs = summary.items;
const jobs = onlyMissing
  ? allJobs.filter((item) => item.research.status === "not_started" || !item.research.updatedAt)
  : allJobs;

if (allJobs.length === 0) {
  console.log(JSON.stringify({ ok: false, error: "No top jobs found.", limit }, null, 2));
  process.exit(1);
}

const startedAt = Math.floor(Date.now() / 1000);
const results: Array<{
  emailId: string;
  subject: string;
  from: string;
  fitScore: number;
  fitLabel: string;
  status: JobResearchView["status"] | "error";
  company: string | null;
  roleTitle: string | null;
  entityKey: string | null;
  nextTool: string | null;
  sourceCount: number;
  error: string | null;
}> = [];

let cursor = 0;

async function worker() {
  while (cursor < jobs.length) {
    const index = cursor;
    cursor += 1;
    const item = jobs[index];
    try {
      const research = await runNodeBenchJobResearch(item.email.id);
      results[index] = {
        emailId: item.email.id,
        subject: item.email.subject,
        from: item.email.from_addr,
        fitScore: item.fitScore,
        fitLabel: item.fitLabel,
        status: research.status,
        company: research.entities.company,
        roleTitle: research.entities.roleTitle,
        entityKey: research.entities.entityKey,
        nextTool: research.contextPack.nextNodeBenchTool,
        sourceCount: research.dossier?.sources.length ?? 0,
        error: research.error,
      };
      console.log(`[${index + 1}/${jobs.length}] ${research.status} ${research.entities.company ?? research.entities.domain ?? "unknown"} - ${research.entities.roleTitle ?? item.email.subject}`);
    } catch (err) {
      results[index] = {
        emailId: item.email.id,
        subject: item.email.subject,
        from: item.email.from_addr,
        fitScore: item.fitScore,
        fitLabel: item.fitLabel,
        status: "error",
        company: null,
        roleTitle: null,
        entityKey: null,
        nextTool: null,
        sourceCount: 0,
        error: err instanceof Error ? err.message : String(err),
      };
      console.log(`[${index + 1}/${jobs.length}] error ${item.email.subject}`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));

const finishedAt = Math.floor(Date.now() / 1000);
const report = {
  ok: results.every((result) => result.status !== "error"),
  startedAt,
  finishedAt,
  durationSeconds: finishedAt - startedAt,
  limit,
  concurrency,
  onlyMissing,
  totals: {
    scanned: summary.totals.scanned,
    selected: allJobs.length,
    selectedForRun: jobs.length,
    skippedExisting: allJobs.length - jobs.length,
    verified: results.filter((result) => result.status === "verified").length,
    needsReview: results.filter((result) => result.status === "needs_review").length,
    failed: results.filter((result) => result.status === "failed" || result.status === "error").length,
    queued: results.filter((result) => result.status === "queued" || result.status === "researching").length,
    sourced: results.filter((result) => result.sourceCount > 0).length,
  },
  privacy: {
    sendsRawEmailBody: false,
    sendsRawResumeFile: false,
    sentSignalsOnly: ["company", "roleTitle", "senderDomain", "recruiterName", "publicJobUrl", "useCase", "goal"],
  },
  results,
};

const outDir = path.resolve(process.cwd(), "reports");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `nodebench-top-jobs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

console.log(JSON.stringify({ ...report, results: results.slice(0, 8), reportPath: outFile }, null, 2));

function numberArg(name: string, fallback: number) {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  if (!arg) return fallback;
  const parsed = Number(arg.slice(name.length + 1));
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function flagArg(name: string) {
  return process.argv.includes(name);
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

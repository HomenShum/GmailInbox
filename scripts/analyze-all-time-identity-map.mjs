import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const db = new Database(path.resolve("src/data/gmail.db"), { readonly: true });

const rows = db.prepare(`
  SELECT e.id, e.from_addr, e.from_name, e.subject, e.snippet,
         substr(coalesce(pb.body_text, e.body, ''), 1, 1600) AS body_sample,
         e.internal_date, e.labels,
         c.lane, c.urgency, c.confidence
  FROM emails e
  LEFT JOIN private_email_bodies pb ON pb.email_id = e.id
  LEFT JOIN latest_classifications c ON c.email_id = e.id
  ORDER BY e.internal_date ASC
`).all();

if (!rows.length) {
  throw new Error("No emails found in src/data/gmail.db");
}

const generatedAt = new Date().toISOString();
const minDate = new Date(rows[0].internal_date * 1000);
const maxDate = new Date(rows.at(-1).internal_date * 1000);
const startMonth = monthKey(minDate);
const endMonth = monthKey(maxDate);
const months = monthRange(startMonth, endMonth);
const monthIndex = new Map(months.map((month, index) => [month, index]));

const STOPWORDS = new Set([
  "the", "and", "for", "you", "your", "with", "from", "this", "that", "have", "has", "are", "was", "were", "not",
  "but", "all", "can", "our", "out", "new", "get", "got", "now", "just", "about", "into", "more", "will", "one",
  "two", "three", "day", "week", "month", "year", "today", "tomorrow", "yesterday", "here", "there", "when",
  "what", "why", "how", "hi", "hello", "thanks", "thank", "regards", "best", "team", "please", "would", "could",
  "should", "may", "might", "also", "per", "via", "use", "using", "used", "see", "read", "open", "make", "made",
  "like", "need", "needs", "want", "wants", "going", "come", "coming", "sent", "send", "message", "mail", "email",
  "emails", "inbox", "re", "fw", "fwd", "amp", "quot", "nbsp", "com", "www", "html", "body", "class", "style",
  "utm", "href", "png", "jpg", "gif", "svg", "px", "font", "color", "margin", "padding", "display", "width",
  "height", "background", "border", "align", "center", "left", "right", "auto", "true", "false", "free", "off",
  "don", "daily", "browser", "top", "average", "total", "status", "failed",
]);

const topics = [
  {
    key: "finance_risk",
    label: "Finance, Risk, Markets",
    short: "Finance",
    color: "#1f9d55",
    kind: "core",
    patterns: [
      /finance|financial|investment|investing|market|stock|equity|portfolio|asset|wealth|banking/i,
      /risk|credit|underwriting|risk analyst|credit analyst|financial analyst|investment analyst|analyst program/i,
      /commercial banking|treasury|jpmorgan|jp morgan|jpm|chase/i,
      /option order|trade executed|robinhood|acorns|investopedia|statement|private client/i,
    ],
  },
  {
    key: "career_jobs",
    label: "Career, Recruiters, Jobs",
    short: "Career",
    color: "#6d5dfc",
    kind: "core",
    patterns: [
      /recruiter|talent acquisition|sourcer|hiring|interview|candidate|job alert|recommended job/i,
      /application|resume|role at|position at|opportunity at|founding engineer|data scientist/i,
      /greenhouse|lever|workday|ashby|wellfound|linkedin job|indeed|smartrecruiters|career/i,
    ],
  },
  {
    key: "ai_agents",
    label: "AI, LLMs, Agents",
    short: "AI",
    color: "#2563eb",
    kind: "emerging-core",
    patterns: [
      /artificial intelligence|machine learning|deep learning|generative|genai/i,
      /\bai\s+(engineer|agent|automation|research|startup|model|product|tool|developer|builder|application|role|lead|platform|company|safety)\b/i,
      /llm|large language model|\bagentic\b|\bagents?\b|openai|anthropic|claude|gemini|qwen|llama/i,
      /langchain|langgraph|mcp|model context protocol|embedding|vector|\brag\b|\bevals?\b|\bevaluation\b|benchmark/i,
    ],
  },
  {
    key: "software_dev",
    label: "Software, Infra, Dev Work",
    short: "Dev",
    color: "#0f766e",
    kind: "emerging-core",
    patterns: [
      /github|pull request|\bpr\b|commit|repo|repository|branch|build failed|deployment/i,
      /typescript|javascript|python|react|next\.js|node\.js|api|database|sqlite|convex/i,
      /vercel|render|docker|cloudflare|supabase|server|frontend|backend|debug|bug/i,
    ],
  },
  {
    key: "product_design",
    label: "Product, Design, UI",
    short: "Product",
    color: "#db2777",
    kind: "emerging-core",
    patterns: [
      /product|prototype|dashboard|workspace|interface|ux|ui|figma|design/i,
      /component|shadcn|tailwind|v0|screenshot|visual|layout|parity|studio/i,
      /roadmap|feature|user experience|customer journey|wireframe|mockup|workflow automation|agent workflow/i,
    ],
  },
  {
    key: "research_learning",
    label: "Research, Learning, Notes",
    short: "Research",
    color: "#7c3aed",
    kind: "active",
    patterns: [
      /research|paper|arxiv|notebook|notes|course|lesson|certification|learn|study/i,
      /newsletter|digest|briefing|report|analysis|whitepaper|webinar|workshop/i,
      /benchmark|evaluation|dataset|ranking|evidence|citation|source/i,
    ],
  },
  {
    key: "startup_builder",
    label: "Startup, Founder, Revenue",
    short: "Startup",
    color: "#f97316",
    kind: "emerging-core",
    patterns: [
      /startup|founder|cofounder|yc|y combinator|accelerator|pitch|investor|vc|venture/i,
      /revenue|customer|users|launch|product hunt|stripe|subscription|pricing|sales/i,
      /growth|go-to-market|gtm|partnership|fundraising|demo day/i,
    ],
  },
  {
    key: "money_tax_admin",
    label: "Money, Tax, Admin",
    short: "Admin",
    color: "#ca8a04",
    kind: "active",
    patterns: [
      /tax|irs|turbotax|accountant|deduction|refund|1099|w-2|w2|chase statement/i,
      /bill|payment|invoice|receipt|renewal|credit card|bank account|due date/i,
      /insurance|tax document|legal document|tax form|contract|subscription renewal/i,
    ],
  },
  {
    key: "personal_life",
    label: "Personal, Family, Health",
    short: "Personal",
    color: "#ec4899",
    kind: "active",
    patterns: [
      /\bfamily\b|\bmom\b|\bmother\b|\bdad\b|\bfriend\b|\bbirthday\b|\bpersonal\b|\brelationship\b|\bhome\b/i,
      /gym|fitness|dance|health|doctor|appointment|therapy|mental|wellness/i,
      /rover|pet|dinner|coffee|classpass|social/i,
    ],
  },
  {
    key: "logistics_travel_auto",
    label: "Travel, Auto, Logistics",
    short: "Logistics",
    color: "#0891b2",
    kind: "context",
    patterns: [
      /flight|airline|hotel|airbnb|reservation|travel|trip|booking|itinerary/i,
      /mazda|vehicle|car|auto|dmv|parking|license|registration|service appointment/i,
      /delivery|shipping|tracking|calendar invite|calendar event/i,
    ],
  },
  {
    key: "consumer_subscriptions",
    label: "Consumer, Shopping, Subscriptions",
    short: "Consumer",
    color: "#64748b",
    kind: "context",
    patterns: [
      /amazon|order|delivered|shopping|sale|discount|promo|coupon|cash back/i,
      /subscription|unsubscribe|newsletter|classpass|squarespace|notion|slack pro/i,
      /receipt|refund|purchase|store|cart|shipping confirmation/i,
    ],
  },
  {
    key: "community_social",
    label: "Community, Events, Network",
    short: "Network",
    color: "#16a34a",
    kind: "active",
    patterns: [
      /event|meetup|conference|hackathon|community|network|invite|rsvp/i,
      /linkedin|slack|discord|twitter|x\.com|club|group|forum/i,
      /speaker|panel|webinar|party|happy hour|dinner/i,
    ],
  },
];

const topicByKey = new Map(topics.map((topic) => [topic.key, topic]));
const monthly = Object.fromEntries(months.map((month) => [month, emptyMonth(month)]));
const yearly = new Map();
const topicStats = Object.fromEntries(topics.map((topic) => [topic.key, emptyTopic(topic)]));
const cooccurrence = new Map();
const senderDomains = new Map();
const laneCounts = new Map();
const globalTerms = new Map();
const phaseSignals = [];

let emailsWithBodySample = 0;
let highSignalEmails = 0;

for (const email of rows) {
  const date = new Date(email.internal_date * 1000);
  const month = monthKey(date);
  const year = String(date.getUTCFullYear());
  const lane = email.lane ?? "unclassified";
  increment(laneCounts, lane, 1);

  const domain = senderDomain(email.from_addr);
  increment(senderDomains, domain, 1);

  if (email.body_sample && email.body_sample.trim()) emailsWithBodySample += 1;

  const publicText = normalize(`${domain} ${email.from_name ?? ""} ${email.subject} ${email.snippet}`);
  const privateContextText = normalize(`${publicText} ${email.body_sample ?? ""}`);
  const matches = classifyTopics(email, privateContextText);
  const isHighSignal = matches.some((match) => !["consumer_subscriptions", "logistics_travel_auto"].includes(match.key));
  if (isHighSignal) highSignalEmails += 1;

  const monthBucket = monthly[month];
  monthBucket.total += 1;
  monthBucket.highSignal += isHighSignal ? 1 : 0;
  for (const match of matches) {
    monthBucket.topics[match.key] = (monthBucket.topics[match.key] ?? 0) + 1;
  }

  const yearBucket = getYear(year);
  yearBucket.total += 1;
  yearBucket.highSignal += isHighSignal ? 1 : 0;
  yearBucket.lanes[lane] = (yearBucket.lanes[lane] ?? 0) + 1;

  const tokenSource = normalize(`${email.subject} ${email.snippet}`);
  const tokens = extractTerms(tokenSource);
  for (const token of tokens.slice(0, 40)) {
    increment(globalTerms, token, 1);
  }

  for (const match of matches) {
    const stat = topicStats[match.key];
    stat.count += 1;
    stat.weight += match.score;
    stat.monthly[month] = (stat.monthly[month] ?? 0) + 1;
    stat.yearly[year] = (stat.yearly[year] ?? 0) + 1;
    stat.lanes[lane] = (stat.lanes[lane] ?? 0) + 1;
    increment(stat.domains, domain, 1);
    for (const token of tokens.slice(0, 35)) {
      increment(stat.terms, token, 1);
    }
    yearBucket.topics[match.key] = (yearBucket.topics[match.key] ?? 0) + 1;
  }

  const uniqueKeys = Array.from(new Set(matches.map((match) => match.key))).sort();
  for (let i = 0; i < uniqueKeys.length; i += 1) {
    for (let j = i + 1; j < uniqueKeys.length; j += 1) {
      increment(cooccurrence, `${uniqueKeys[i]}::${uniqueKeys[j]}`, 1);
    }
  }
}

for (const topic of topics) {
  const stat = topicStats[topic.key];
  const last12 = sumMonths(stat.monthly, months.slice(-12));
  const prev12 = sumMonths(stat.monthly, months.slice(-24, -12));
  stat.last12 = last12;
  stat.prev12 = prev12;
  stat.momentum = prev12 === 0 ? last12 : Number(((last12 - prev12) / prev12).toFixed(2));
  stat.share = Number((stat.count / rows.length).toFixed(4));
  stat.topTerms = topEntries(stat.terms, 12).map(([term, count]) => ({ term, count }));
  stat.topDomains = topEntries(stat.domains, 8)
    .filter(([domain]) => !isPersonalDomain(domain))
    .map(([domain, count]) => ({ domain, count }));
  delete stat.terms;
  delete stat.domains;
}

const monthlySeries = months.map((month) => {
  const bucket = monthly[month];
  const entry = {
    month,
    total: bucket.total,
    highSignal: bucket.highSignal,
  };
  for (const topic of topics) {
    entry[topic.key] = bucket.topics[topic.key] ?? 0;
  }
  return entry;
});

for (const topic of topics) {
  addCumulative(monthlySeries, topic.key, `${topic.key}_cumulative`);
}
addCumulative(monthlySeries, "highSignal", "highSignal_cumulative");

const yearlyRows = Array.from(yearly.values())
  .sort((a, b) => a.year.localeCompare(b.year))
  .map((row) => ({
    ...row,
    topTopics: topEntries(row.topics, 5).map(([key, count]) => ({
      key,
      label: topicByKey.get(key)?.short ?? key,
      count,
    })),
  }));

const topicRows = topics.map((topic) => ({
  key: topic.key,
  label: topic.label,
  short: topic.short,
  color: topic.color,
  kind: topic.kind,
  ...topicStats[topic.key],
})).sort((a, b) => b.count - a.count);

const topicEdges = topEntries(cooccurrence, 22).map(([key, count]) => {
  const [source, target] = key.split("::");
  return {
    source,
    target,
    sourceLabel: topicByKey.get(source)?.short ?? source,
    targetLabel: topicByKey.get(target)?.short ?? target,
    count,
  };
});

const phases = derivePhases(yearlyRows);
const report = {
  generatedAt,
  source: "local Gmail SQLite: all emails since day 0, using metadata, sender domain, subject, snippet, lane classification, and bounded body samples for local-only classification",
  privacy: {
    rawEmailBodiesExported: false,
    rawEmailAddressesExported: false,
    sampledPrivateBodyCharactersPerEmailForLocalClassification: 1600,
    aggregateOnly: true,
  },
  range: {
    startDate: isoDate(minDate),
    endDate: isoDate(maxDate),
    startMonth,
    endMonth,
  },
  totals: {
    emails: rows.length,
    emailsWithBodySample,
    highSignalEmails,
    classifiedLaneCoverage: rows.filter((row) => row.lane).length,
  },
  lanes: topEntries(laneCounts, 20).map(([lane, count]) => ({ lane, count })),
  globalTerms: topEntries(globalTerms, 40).map(([term, count]) => ({ term, count })),
  topics: topicRows,
  topicEdges,
  phases,
  yearly: yearlyRows,
  monthly: monthlySeries,
  productionDesign: buildProductionDesign(),
  interpretation: buildInterpretation(topicRows, yearlyRows, phases),
};

const outDir = path.resolve("reports");
fs.mkdirSync(outDir, { recursive: true });
const baseName = `all-time-identity-mindmap-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const jsonPath = path.join(outDir, `${baseName}.json`);
const htmlPath = path.join(outDir, `${baseName}.html`);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(htmlPath, renderHtml(report));

fs.mkdirSync(path.resolve("public"), { recursive: true });
fs.copyFileSync(jsonPath, path.resolve("public/all-time-identity-mindmap.json"));
fs.copyFileSync(htmlPath, path.resolve("public/all-time-identity-mindmap.html"));

console.log(JSON.stringify({
  ok: true,
  htmlPath,
  jsonPath,
  publicUrl: "http://localhost:3030/all-time-identity-mindmap.html",
  range: report.range,
  totals: report.totals,
  topTopics: report.topics.slice(0, 8).map((topic) => ({
    key: topic.key,
    count: topic.count,
    last12: topic.last12,
    momentum: topic.momentum,
  })),
  phases: report.phases,
}, null, 2));

function classifyTopics(email, text) {
  const lane = email.lane ?? "";
  const matches = [];
  const tradingContext = /option order|trade executed|robinhood|limit price|contracts?|put credit|call credit/i.test(text);
  for (const topic of topics) {
    let score = 0;
    for (const pattern of topic.patterns) {
      if (pattern.test(text)) score += 1;
    }
    if (lane === "career" && topic.key === "career_jobs") score += 2;
    if (lane === "job_alerts" && topic.key === "career_jobs") score += 2;
    if (lane === "dev_ci" && topic.key === "software_dev") score += 2;
    if (lane === "money" && ["finance_risk", "money_tax_admin"].includes(topic.key)) score += 1;
    if (lane === "reading" && topic.key === "research_learning") score += 1;
    if (lane === "shopping" && topic.key === "consumer_subscriptions") score += 2;
    if (lane === "subscriptions" && topic.key === "consumer_subscriptions") score += 1;
    if (lane === "travel_auto" && topic.key === "logistics_travel_auto") score += 2;
    if (topic.key === "consumer_subscriptions" && tradingContext && !/(amazon|shopping|shipping|delivery|refund|purchase|store|cart|sale|discount|coupon|promo|receipt)/i.test(text)) {
      score = 0;
    }
    if (topic.key === "ai_agents" && tradingContext && !/(artificial intelligence|machine learning|openai|anthropic|llm|agentic|ai engineer|ai agent|ai startup|ai research|langchain|langgraph)/i.test(text)) {
      score = 0;
    }
    if (score > 0) matches.push({ key: topic.key, score });
  }
  if (!matches.length) {
    const fallback = laneFallback(lane);
    if (fallback) matches.push({ key: fallback, score: 1 });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, 5);
}

function laneFallback(lane) {
  switch (lane) {
    case "career": return "career_jobs";
    case "job_alerts": return "career_jobs";
    case "dev_ci": return "software_dev";
    case "money": return "money_tax_admin";
    case "shopping": return "consumer_subscriptions";
    case "subscriptions": return "consumer_subscriptions";
    case "travel_auto": return "logistics_travel_auto";
    case "reading": return "research_learning";
    default: return null;
  }
}

function derivePhases(yearRows) {
  return yearRows.map((row) => {
    const top = row.topTopics.slice(0, 3);
    const labels = top.map((item) => item.label).join(" + ");
    let name = `${row.year}: ${labels}`;
    if (row.year === "2018") name = "2018: finance curiosity and life intake begins";
    if (row.year === "2020") name = "2020: JPM applications and career funnel";
    if (row.year === "2021") name = "2021: JPM/analyst identity becomes real";
    if (row.year === "2023") name = "2023: AI and engineering vocabulary becomes material";
    if (row.year === "2024") name = "2024: finance-to-builder transition";
    if (row.year === "2025") name = "2025: builder output creates larger AI/dev signal";
    if (row.year === "2026") name = "2026: agentic workspace and public builder identity";
    return {
      year: row.year,
      name,
      total: row.total,
      highSignal: row.highSignal,
      topTopics: top,
    };
  });
}

function buildInterpretation(topicRows, yearRows, phases) {
  const top = topicRows.slice(0, 5).map((topic) => topic.short).join(", ");
  const fastest = topicRows
    .filter((topic) => topic.prev12 >= 30 || topic.last12 >= 30)
    .sort((a, b) => b.momentum - a.momentum)
    .slice(0, 4)
    .map((topic) => topic.short);
  const latestYear = yearRows.at(-1);
  return [
    `The all-time inbox map is not one identity. It is a layered system. The strongest recurring circles are ${top}.`,
    `The most important change is not volume alone; it is semantic migration. Finance/risk remains a foundation, while AI, software, product, and startup language move from the edge into the center.`,
    `The fastest recent momentum appears in ${fastest.join(", ") || "the emerging builder topics"}. That is the evidence for the current builder identity.`,
    latestYear ? `In ${latestYear.year}, the inbox is less about proving interest and more about operating a workspace: jobs, agents, dev work, product loops, admin closure, and context routing.` : "",
  ].filter(Boolean);
}

function buildProductionDesign() {
  return [
    {
      layer: "L0 Deterministic index",
      role: "Read every email/thread once, normalize sender/domain/date/subject/snippet/body hash, classify with fast rules, build topic/time/entity indexes.",
      verification: "Idempotent hashes, row counts, sample audits, deterministic re-run diff.",
      modelUse: "No LLM.",
    },
    {
      layer: "L1 Shard summaries",
      role: "Summarize small shards such as month x topic x sender-domain, never the whole mailbox.",
      verification: "Structured JSON schema, citations to email ids only, confidence and missing-evidence fields.",
      modelUse: "Cheap/free OpenRouter models through the pi-ai ladder.",
    },
    {
      layer: "L2 Judge and contradiction pass",
      role: "A second model judges whether each claimed identity/topic trend is supported by aggregate evidence.",
      verification: "Accept/revise/reject verdict, evidence coverage score, disagreement queue.",
      modelUse: "Different free model than L1, routed through Kilo-style failover.",
    },
    {
      layer: "L3 Human dogfood review",
      role: "Show top claims, strongest evidence counts, and examples privately for the user to approve before anything becomes memory.",
      verification: "User approval, hidden/private boundary, no raw email exported.",
      modelUse: "Agent only explains and asks targeted questions.",
    },
    {
      layer: "L4 Long-term memory graph",
      role: "Promote verified claims into durable nodes: identity, skills, companies, people, projects, goals, commitments, timeline.",
      verification: "Every node links back to aggregate shards and versioned claim records.",
      modelUse: "LLM only updates claim wording; storage is deterministic.",
    },
  ];
}

function renderHtml(report) {
  const topTopics = report.topics.slice(0, 10);
  const topicCards = topTopics.map((topic) => `
    <article class="topic-card" style="--topic:${topic.color}">
      <div class="topic-head">
        <span class="dot"></span>
        <strong>${escapeHtml(topic.label)}</strong>
      </div>
      <div class="topic-stat">${formatNumber(topic.count)}</div>
      <p>${formatNumber(topic.last12)} in latest 12 months · momentum ${formatMomentum(topic.momentum)}</p>
      <div class="terms">${topic.topTerms.slice(0, 7).map((item) => `<span>${escapeHtml(item.term)}</span>`).join("")}</div>
    </article>
  `).join("");

  const phaseRows = report.phases.map((phase) => `
    <div class="phase">
      <div class="phase-year">${escapeHtml(phase.year)}</div>
      <div>
        <strong>${escapeHtml(phase.name)}</strong>
        <p>${formatNumber(phase.highSignal)} high-signal emails · top: ${phase.topTopics.map((item) => escapeHtml(item.label)).join(", ")}</p>
      </div>
    </div>
  `).join("");

  const yearlyRows = report.yearly.map((row) => `
    <tr>
      <td>${escapeHtml(row.year)}</td>
      <td>${formatNumber(row.total)}</td>
      <td>${formatNumber(row.highSignal)}</td>
      <td>${row.topTopics.map((topic) => `${escapeHtml(topic.label)} ${formatNumber(topic.count)}`).join("<br />")}</td>
    </tr>
  `).join("");

  const pipelineRows = report.productionDesign.map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.layer)}</strong></td>
      <td>${escapeHtml(row.role)}</td>
      <td>${escapeHtml(row.verification)}</td>
      <td>${escapeHtml(row.modelUse)}</td>
    </tr>
  `).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>All-Time Inbox Identity Mindmap</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f8fb;
      --panel: #ffffff;
      --ink: #0f172a;
      --muted: #64748b;
      --line: #d8e0ec;
      --purple: #5b4ff5;
      --green: #16803c;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: radial-gradient(circle at 50% -5%, #ffffff 0, #f6f8fb 42%, #eef3f8 100%); color: var(--ink); }
    main { width: min(1320px, calc(100vw - 40px)); margin: 28px auto 48px; }
    .hero { display: grid; grid-template-columns: 1fr 430px; gap: 18px; align-items: stretch; }
    .panel { background: rgba(255,255,255,.92); border: 1px solid var(--line); border-radius: 14px; box-shadow: 0 22px 70px rgba(15,23,42,.08); }
    .intro { padding: 28px; }
    .eyebrow { color: var(--green); text-transform: uppercase; font-weight: 800; letter-spacing: .08em; font-size: 12px; }
    h1 { margin: 8px 0 12px; font-size: clamp(30px, 5vw, 58px); line-height: .95; letter-spacing: 0; max-width: 900px; }
    h2 { margin: 0 0 14px; font-size: 20px; letter-spacing: 0; }
    p { color: var(--muted); line-height: 1.55; margin: 0; }
    .stats { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; padding: 14px; }
    .stat { border: 1px solid var(--line); border-radius: 12px; padding: 16px; background: linear-gradient(180deg, #fff, #f8fafc); }
    .stat small { display: block; color: var(--muted); margin-bottom: 8px; }
    .stat strong { font-size: 30px; letter-spacing: 0; }
    .grid { display: grid; grid-template-columns: 1.08fr .92fr; gap: 18px; margin-top: 18px; }
    .wide { margin-top: 18px; padding: 18px; }
    .chart-wrap { padding: 18px; }
    svg { display: block; width: 100%; height: auto; }
    .topics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
    .topic-card { border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: #fff; min-height: 150px; }
    .topic-head { display: flex; gap: 8px; align-items: center; min-height: 38px; }
    .dot { width: 10px; height: 10px; border-radius: 999px; background: var(--topic); flex: 0 0 auto; }
    .topic-stat { margin-top: 10px; font-size: 27px; font-weight: 850; }
    .topic-card p { font-size: 12px; margin-top: 2px; }
    .terms { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
    .terms span { border: 1px solid #e3e8f1; border-radius: 999px; padding: 4px 7px; font-size: 11px; color: #334155; background: #f8fafc; }
    .phase-list { display: grid; gap: 10px; }
    .phase { display: grid; grid-template-columns: 70px 1fr; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
    .phase-year { font-weight: 850; color: var(--purple); }
    .phase p { font-size: 13px; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; border-bottom: 1px solid #e5edf6; padding: 10px 8px; vertical-align: top; }
    th { color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; }
    .interpretation { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .interpretation div { border: 1px solid var(--line); border-radius: 12px; padding: 14px; background: #fbfdff; color: #334155; line-height: 1.5; }
    .small { font-size: 12px; color: var(--muted); margin-top: 12px; }
    @media (max-width: 1050px) {
      .hero, .grid { grid-template-columns: 1fr; }
      .topics { grid-template-columns: repeat(2, 1fr); }
      .interpretation { grid-template-columns: 1fr; }
    }
    @media (max-width: 640px) {
      main { width: calc(100vw - 22px); margin-top: 12px; }
      .topics, .stats { grid-template-columns: 1fr; }
      .intro { padding: 20px; }
      h1 { font-size: 36px; }
    }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="panel intro">
        <div class="eyebrow">All-time inbox identity analysis</div>
        <h1>Day-zero email mindmap</h1>
        <p>All ${formatNumber(report.totals.emails)} local emails from ${escapeHtml(report.range.startDate)} to ${escapeHtml(report.range.endDate)}, reduced into semantic circles, identity phases, topic momentum, and a production-grade agent pipeline. Aggregates only; raw email bodies and raw addresses are not exported.</p>
      </div>
      <div class="panel stats">
        <div class="stat"><small>Total emails</small><strong>${formatNumber(report.totals.emails)}</strong></div>
        <div class="stat"><small>High-signal emails</small><strong>${formatNumber(report.totals.highSignalEmails)}</strong></div>
        <div class="stat"><small>Range</small><strong>${escapeHtml(report.range.startMonth)}</strong></div>
        <div class="stat"><small>Latest month</small><strong>${escapeHtml(report.range.endMonth)}</strong></div>
      </div>
    </section>

    <section class="panel wide">
      <h2>Identity Star Chart</h2>
      ${renderTrendSvg(report)}
      <p class="small">Cumulative topic signals over time. This is an inbox-derived signal chart, not a claim that every email is equally meaningful.</p>
    </section>

    <section class="panel wide">
      <h2>Semantic Topic Circles</h2>
      ${renderMindmapSvg(report)}
    </section>

    <section class="panel wide">
      <h2>Current Topic Surface</h2>
      <div class="topics">${topicCards}</div>
    </section>

    <section class="grid">
      <section class="panel wide" style="margin-top:0">
        <h2>Identity Phases</h2>
        <div class="phase-list">${phaseRows}</div>
      </section>
      <section class="panel wide" style="margin-top:0">
        <h2>Yearly Semantics</h2>
        <table>
          <thead><tr><th>Year</th><th>Total</th><th>High signal</th><th>Top topics</th></tr></thead>
          <tbody>${yearlyRows}</tbody>
        </table>
      </section>
    </section>

    <section class="panel wide">
      <h2>Interpretation</h2>
      <div class="interpretation">${report.interpretation.map((item) => `<div>${escapeHtml(item)}</div>`).join("")}</div>
    </section>

    <section class="panel wide">
      <h2>How To Handle 90k Emails With Agents</h2>
      <table>
        <thead><tr><th>Layer</th><th>Role</th><th>Verification</th><th>Model use</th></tr></thead>
        <tbody>${pipelineRows}</tbody>
      </table>
      <p class="small">Product rule: every LLM sentence that becomes memory must be backed by a deterministic shard, a claim id, confidence, and a verifier verdict. The LLM is not the database; it is a bounded worker over retrieved context.</p>
    </section>
  </main>
</body>
</html>`;
}

function renderTrendSvg(report) {
  const width = 1220;
  const height = 520;
  const pad = { left: 54, right: 22, top: 26, bottom: 62 };
  const series = report.monthly;
  const keys = ["finance_risk", "career_jobs", "ai_agents", "software_dev", "product_design", "startup_builder"];
  const maxY = Math.max(...keys.flatMap((key) => series.map((row) => row[`${key}_cumulative`] ?? 0)), 1);
  const x = (index) => pad.left + (index / Math.max(series.length - 1, 1)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + (1 - value / maxY) * (height - pad.top - pad.bottom);
  const grid = [0, .25, .5, .75, 1].map((ratio) => {
    const yy = y(maxY * ratio);
    return `<line x1="${pad.left}" y1="${yy}" x2="${width - pad.right}" y2="${yy}" stroke="#dbe4ef" /><text x="8" y="${yy + 4}" fill="#64748b" font-size="12">${formatNumber(Math.round(maxY * ratio))}</text>`;
  }).join("");
  const yearMarkers = report.yearly.map((row) => {
    const index = monthIndex.get(`${row.year}-01`) ?? 0;
    const xx = x(index);
    return `<line x1="${xx}" y1="${pad.top}" x2="${xx}" y2="${height - pad.bottom}" stroke="#e2e8f0" /><text x="${xx}" y="${height - 28}" fill="#64748b" font-size="12">${row.year}</text>`;
  }).join("");
  const paths = keys.map((key) => {
    const topic = topicByKey.get(key);
    const d = series.map((row, index) => `${index === 0 ? "M" : "L"} ${x(index).toFixed(2)} ${y(row[`${key}_cumulative`] ?? 0).toFixed(2)}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${topic.color}" stroke-width="3" stroke-linecap="round" />`;
  }).join("");
  const legend = keys.map((key, index) => {
    const topic = topicByKey.get(key);
    const lx = pad.left + index * 172;
    return `<g transform="translate(${lx},${height - 18})"><circle r="5" fill="${topic.color}" /><text x="10" y="4" fill="#334155" font-size="12">${escapeHtml(topic.short)}</text></g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="All-time cumulative identity topic trend">
    <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="#fff" />
    ${grid}
    ${yearMarkers}
    ${paths}
    ${legend}
  </svg>`;
}

function renderMindmapSvg(report) {
  const width = 1220;
  const height = 580;
  const cx = width / 2;
  const cy = height / 2;
  const nodes = report.topics.slice(0, 11).map((topic, index, arr) => {
    const angle = -Math.PI / 2 + index * ((Math.PI * 2) / arr.length);
    const radius = topic.kind === "emerging-core" ? 190 : topic.kind === "core" ? 160 : topic.kind === "active" ? 240 : 305;
    const size = Math.max(42, Math.min(86, 32 + Math.sqrt(topic.count) * 1.35));
    return {
      ...topic,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      size,
    };
  });
  const byKey = new Map(nodes.map((node) => [node.key, node]));
  const edgeLines = report.topicEdges
    .filter((edge) => byKey.has(edge.source) && byKey.has(edge.target))
    .slice(0, 16)
    .map((edge) => {
      const a = byKey.get(edge.source);
      const b = byKey.get(edge.target);
      const opacity = Math.min(.42, .08 + edge.count / 8000);
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#94a3b8" stroke-width="${Math.min(6, 1 + edge.count / 1200)}" opacity="${opacity}" />`;
    }).join("");
  const spokes = nodes.map((node) => `<line x1="${cx}" y1="${cy}" x2="${node.x}" y2="${node.y}" stroke="${node.color}" stroke-width="1.4" opacity=".28" />`).join("");
  const circles = nodes.map((node) => `
    <g transform="translate(${node.x},${node.y})">
      <circle r="${node.size}" fill="${node.color}" opacity=".13" />
      <circle r="${node.size}" fill="none" stroke="${node.color}" stroke-width="2" />
      <text text-anchor="middle" y="-5" font-size="14" font-weight="800" fill="#0f172a">${escapeHtml(node.short)}</text>
      <text text-anchor="middle" y="15" font-size="12" fill="#475569">${formatNumber(node.count)}</text>
    </g>
  `).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Semantic topic mindmap">
    <rect x="0" y="0" width="${width}" height="${height}" rx="14" fill="#fff" />
    <circle cx="${cx}" cy="${cy}" r="112" fill="#f7f7ff" stroke="#c7d2fe" />
    ${edgeLines}
    ${spokes}
    <text x="${cx}" y="${cy - 10}" text-anchor="middle" font-size="21" font-weight="900" fill="#111827">Inbox Identity</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="13" fill="#64748b">topics, work, people, commitments</text>
    ${circles}
  </svg>`;
}

function emptyMonth(month) {
  return { month, total: 0, highSignal: 0, topics: {} };
}

function emptyTopic(topic) {
  return {
    key: topic.key,
    count: 0,
    weight: 0,
    share: 0,
    last12: 0,
    prev12: 0,
    momentum: 0,
    monthly: {},
    yearly: {},
    lanes: {},
    terms: new Map(),
    domains: new Map(),
  };
}

function getYear(year) {
  if (!yearly.has(year)) {
    yearly.set(year, { year, total: 0, highSignal: 0, topics: {}, lanes: {} });
  }
  return yearly.get(year);
}

function addCumulative(series, sourceKey, targetKey) {
  let running = 0;
  for (const row of series) {
    running += row[sourceKey] ?? 0;
    row[targetKey] = running;
  }
}

function sumMonths(monthlyCounts, keys) {
  return keys.reduce((total, month) => total + (monthlyCounts[month] ?? 0), 0);
}

function topEntries(mapLike, limit) {
  const entries = mapLike instanceof Map ? Array.from(mapLike.entries()) : Object.entries(mapLike);
  return entries.sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function increment(map, key, amount) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function senderDomain(addr) {
  const raw = String(addr ?? "").toLowerCase();
  const match = raw.match(/@([a-z0-9.-]+\.[a-z]{2,})/i);
  if (!match) return "unknown";
  return match[1].replace(/^mail\./, "").replace(/^noreply\./, "");
}

function isPersonalDomain(domain) {
  return /^(gmail|googlemail|icloud|me|outlook|hotmail|yahoo|aol)\.com$/.test(domain);
}

function normalize(value) {
  return String(value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, " ")
    .replace(/&nbsp;|&amp;|&quot;|&#39;|&lt;|&gt;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractTerms(text) {
  const tokens = normalize(text)
    .split(/[^a-z0-9+#.-]+/i)
    .map((token) => token.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ""))
    .filter((token) => token.length >= 3 && token.length <= 28)
    .filter((token) => !STOPWORDS.has(token))
    .filter((token) => !/^\d+$/.test(token))
    .filter((token) => !/^(gmail|email|unsubscribe|view|click|202[0-9]|201[0-9])$/.test(token));
  const unique = [];
  const seen = new Set();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
  }
  return unique;
}

function monthRange(start, end) {
  const result = [];
  const cursor = new Date(`${start}-01T00:00:00Z`);
  const stop = new Date(`${end}-01T00:00:00Z`);
  while (cursor <= stop) {
    result.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return result;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function formatMomentum(value) {
  if (!Number.isFinite(value)) return "n/a";
  if (value > 0) return `+${Math.round(value * 100)}%`;
  return `${Math.round(value * 100)}%`;
}

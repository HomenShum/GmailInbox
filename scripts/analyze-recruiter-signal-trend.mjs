import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const db = new Database(path.resolve("src/data/gmail.db"), { readonly: true });
const rows = db.prepare(`
  SELECT e.id, e.from_addr, e.from_name, e.subject, e.snippet, e.internal_date,
         c.lane, c.urgency, c.confidence
  FROM emails e
  LEFT JOIN latest_classifications c ON c.email_id = e.id
  WHERE e.internal_date >= strftime('%s', '2018-01-01')
  ORDER BY e.internal_date ASC
`).all();

const startMonth = "2021-01";
const endMonth = monthKey(new Date());
const months = monthRange(startMonth, endMonth);
const buckets = Object.fromEntries(months.map((month) => [month, emptyBucket(month)]));

const signals = [];
const pre2021 = {
  financeCuriosity: 0,
  jpmApplications: 0,
};

for (const email of rows) {
  const date = new Date(email.internal_date * 1000);
  const month = monthKey(date);
  const text = normalize(`${email.from_addr} ${email.from_name ?? ""} ${email.subject} ${email.snippet}`);
  const kind = classify(email, text);

  if (date < new Date("2021-01-01T00:00:00Z")) {
    if (/(investopedia|robinhood|acorns|jpm|jpmorgan|finance|investment|stock|option order|trade executed|risk|analyst|bank)/i.test(text)
      && !isConsumerMarketing(text, email.lane ?? "")) {
      pre2021.financeCuriosity += 1;
    }
    if (/jpmorgan chase/i.test(text) && /(submission|application|analyst|program|career)/i.test(text)) {
      pre2021.jpmApplications += 1;
    }
    continue;
  }

  if (!kind.isSignal || !buckets[month]) continue;

  const bucket = buckets[month];
  bucket.total += 1;
  bucket.weighted += kind.weight;
  if (kind.directRecruiter) bucket.directRecruiter += 1;
  if (kind.jobAlert) bucket.jobAlerts += 1;
  if (kind.financeRisk) bucket.financeRisk += 1;
  if (kind.engineeringDev) bucket.engineeringDev += 1;
  if (kind.aiAgent) bucket.aiAgent += 1;

  signals.push({
    id: email.id,
    month,
    date: isoDate(date),
    subject: cleanSubject(email.subject),
    from: cleanSender(email.from_name, email.from_addr),
    lane: email.lane,
    tags: kind.tags,
  });
}

const series = months.map((month) => buckets[month]);
addCumulative(series, "total", "cumulativeTotal");
addCumulative(series, "directRecruiter", "cumulativeDirect");
addCumulative(series, "financeRisk", "cumulativeFinanceRisk");
addCumulative(series, "engineeringDev", "cumulativeEngineeringDev");
addCumulative(series, "aiAgent", "cumulativeAiAgent");

const yearly = Array.from(
  groupBy(series, (row) => row.month.slice(0, 4)).entries(),
  ([year, items]) => ({
    year,
    total: sum(items, "total"),
    directRecruiter: sum(items, "directRecruiter"),
    jobAlerts: sum(items, "jobAlerts"),
    financeRisk: sum(items, "financeRisk"),
    engineeringDev: sum(items, "engineeringDev"),
    aiAgent: sum(items, "aiAgent"),
  }),
);

const milestones = buildMilestones(rows, signals, series);
const insights = buildInsights(yearly, series, milestones);
const postDraft = buildPostDraft(insights, milestones);

const report = {
  generatedAt: new Date().toISOString(),
  source: "local Gmail SQLite metadata, subjects, snippets, and lane classifications",
  privacy: {
    rawEmailBodiesRead: false,
    rawEmailBodiesExported: false,
    chartUsesAggregates: true,
  },
  range: { startMonth, endMonth },
  pre2021,
  milestones,
  yearly,
  insights,
  postDraft,
  series,
  sampleSignals: signals.slice(-20),
};

const outDir = path.resolve("reports");
fs.mkdirSync(outDir, { recursive: true });
const baseName = `job-recruiter-signal-journey-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const jsonPath = path.join(outDir, `${baseName}.json`);
const htmlPath = path.join(outDir, `${baseName}.html`);
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
fs.writeFileSync(htmlPath, renderHtml(report));

console.log(JSON.stringify({
  ok: true,
  htmlPath,
  jsonPath,
  range: report.range,
  pre2021: report.pre2021,
  yearly,
  insights,
}, null, 2));

function classify(email, text) {
  const lane = email.lane ?? "";
  const from = normalize(`${email.from_addr} ${email.from_name ?? ""}`);

  const jobAlert = /(linkedin job|jobs-listings|jobalerts|job alert|recommended job|indeed|wellfound|greenhouse|lever|workday|ashby|smartrecruiters)/i.test(from)
    || /(new jobs|job alert|recommended for you|is looking for:|jobs? at|open roles)/i.test(text);
  const knownCareerSender = jobAlert
    || /(jpmc@yello|workflow\\.mail\\.us2\\.cloud\\.oracle|linkedin\\.com|indeed|wellfound|greenhouse|lever|workday|ashby|smartrecruiters|recruit|talent|careers?@|jobs?@)/i.test(from);
  const strongCareerPhrase = /(talent acquisition|recruiter|sourcer|interview|hiring|we are hiring|we're hiring|job opening|open role|opportunity at|role at|founding engineer|software engineer|data scientist|data science|credit analyst|risk analyst|business analyst|product manager|application for|thank you for your submission|career with us|start date update|analyst team|offer letter|candidate|position at|would love to chat|quick call)/i.test(text);
  if (isConsumerMarketing(text, lane) && !knownCareerSender && !strongCareerPhrase) {
    return { isSignal: false, weight: 0, tags: [] };
  }

  const directRecruiter = !jobAlert && (
    lane === "career"
    || lane === "reply_now"
    || /(recruiter|talent|sourcer|hiring|founder|interview|opportunity|role|candidate|would love to chat|quick call|connect with you)/i.test(text)
  );
  const financeRisk = /(jpmorgan|jp morgan|jpm|chase.com|risk|credit|finance|banking|investment|analyst|treasury|commercial banking|asset wealth|underwriting|portfolio|markets)/i.test(text);
  const engineeringDev = /(software|engineer|developer|full.?stack|backend|frontend|platform|api|cloud|devops|github|vercel|data scientist|data science|machine learning|technical|founding engineer)/i.test(text);
  const aiAgent = /(\bai\b|artificial intelligence|openai|anthropic|llm|agentic|agent engineer|genai|machine learning|ml engineer|forward deploy|deployment engineer|automation|research pipeline)/i.test(text);
  const careerSignal = lane === "career" || lane === "job_alerts" || lane === "reply_now"
    || jobAlert
    || knownCareerSender
    || directRecruiter
    || strongCareerPhrase;

  if (!careerSignal) return { isSignal: false, weight: 0, tags: [] };

  const tags = [];
  if (jobAlert) tags.push("job alert");
  if (directRecruiter) tags.push("direct recruiter");
  if (financeRisk) tags.push("finance/risk");
  if (engineeringDev) tags.push("engineering/dev");
  if (aiAgent) tags.push("ai/agent");

  const weight = 1
    + (directRecruiter ? 2 : 0)
    + (/interview|offer letter|quick call|schedule/i.test(text) ? 2 : 0)
    + (aiAgent ? 1 : 0);

  return {
    isSignal: true,
    weight,
    jobAlert,
    directRecruiter,
    financeRisk,
    engineeringDev,
    aiAgent,
    tags,
  };
}

function isConsumerMarketing(text, lane) {
  if (lane === "career" || lane === "job_alerts" || lane === "reply_now") return false;
  return /(keeps|paypal|venmo|squarespace|pacsun|hollister|bulletproof|nootropics|chase center|ticket|movie|lyft|uber|amazon|classpass|barefoot coffee|coupon|cash back|purchase|order|discount|last chance|limited time|free shipping|receipt|refund|cardholder|sale ends|shop now|promo)/i.test(text);
}

function buildMilestones(allRows, signalRows, monthlySeries) {
  const textOf = (email) => normalize(`${email.from_addr} ${email.from_name ?? ""} ${email.subject} ${email.snippet}`);
  const jpmApplication = allRows.find((email) => (
    email.internal_date >= Date.parse("2020-12-01") / 1000
    && /jpmorgan chase/i.test(textOf(email))
    && /(submission|application|analyst program|career)/i.test(textOf(email))
  ));
  const jpmTeam = allRows.find((email) => (
    email.internal_date >= Date.parse("2021-06-01") / 1000
    && email.internal_date < Date.parse("2021-08-01") / 1000
    && /(jpmorgan\\.com|chase\\.com|jpmorgan chase)/i.test(textOf(email))
    && /(analyst team|start date|credit analyst|commercial banking|looking forward|on the team)/i.test(textOf(email))
  ));
  const materialAi = monthlySeries.find((row) => (
    row.month >= "2023-01"
    && row.aiAgent >= 25
    && row.engineeringDev >= 25
  )) ?? monthlySeries.find((row) => row.aiAgent >= 25);
  const directAiByMonth = new Map();
  for (const signal of signalRows) {
    if (signal.tags.includes("ai/agent") && signal.tags.includes("direct recruiter")) {
      directAiByMonth.set(signal.month, (directAiByMonth.get(signal.month) ?? 0) + 1);
    }
  }
  const materialDirectAi = Array.from(directAiByMonth.entries())
    .find(([month, count]) => month >= "2023-01" && count >= 3);

  return [
    {
      date: "2018-01",
      label: "Finance curiosity begins",
      detail: "Investment, market, and risk-analysis interest shows up before the career turn.",
    },
    jpmApplication ? {
      date: monthKey(new Date(jpmApplication.internal_date * 1000)),
      label: "JPM applications",
      detail: "JPMorgan Chase application/submission emails appear before the 2021 start.",
    } : null,
    jpmTeam ? {
      date: monthKey(new Date(jpmTeam.internal_date * 1000)),
      label: "JPM analyst chapter starts",
      detail: "Team/start-date and analyst-team emails indicate the JPM role is active.",
    } : {
      date: "2021-06",
      label: "JPM analyst chapter starts",
      detail: "User-provided milestone: JPM role begins in 2021.",
    },
    {
      date: "2024-12",
      label: "Finance-to-builder transition",
      detail: "User-provided milestone: 3.5-year JPM chapter ends and builder identity becomes primary.",
    },
    materialAi ? {
      date: materialAi.month,
      label: "AI/engineering signal becomes material",
      detail: "The inbox shift becomes repeated enough to treat as a real career-signal pattern, not a one-off keyword match.",
    } : null,
    materialDirectAi ? {
      date: materialDirectAi[0],
      label: "Direct AI recruiter signal repeats",
      detail: "Direct recruiter-style AI/engineering opportunities start showing up as a repeatable inbound pattern.",
    } : null,
    {
      date: "2026-05",
      label: "Building as identity",
      detail: "NodeBench, Gmail workspace, pinned context, and agentic workflows become the visible output engine.",
    },
  ].filter(Boolean);
}

function buildInsights(yearly, series, milestones) {
  const latest = yearly[yearly.length - 1] ?? {};
  const peak = yearly.reduce((best, row) => (row.total > (best?.total ?? -1) ? row : best), null);
  const aiPeak = yearly.reduce((best, row) => (row.aiAgent > (best?.aiAgent ?? -1) ? row : best), null);
  const financePeak = yearly.reduce((best, row) => (row.financeRisk > (best?.financeRisk ?? -1) ? row : best), null);
  const directPeak = yearly.reduce((best, row) => (row.directRecruiter > (best?.directRecruiter ?? -1) ? row : best), null);
  const totalSignals = series.at(-1)?.cumulativeTotal ?? 0;
  const aiSignals = series.at(-1)?.cumulativeAiAgent ?? 0;
  const financeSignals = series.at(-1)?.cumulativeFinanceRisk ?? 0;
  return {
    totalSignals,
    aiSignals,
    financeSignals,
    peakYear: peak?.year,
    peakYearSignals: peak?.total ?? 0,
    aiPeakYear: aiPeak?.year,
    directPeakYear: directPeak?.year,
    financePeakYear: financePeak?.year,
    latestYear: latest.year,
    latestYearSignals: latest.total ?? 0,
    latestYearAiSignals: latest.aiAgent ?? 0,
    milestoneCount: milestones.length,
  };
}

function buildPostDraft(insights, milestones) {
  const jpmStart = milestones.find((item) => /JPM analyst/.test(item.label))?.date ?? "2021";
  return [
    "I have been thinking about how much your inbox quietly records your identity shifts.",
    "",
    "In 2018, I was trying hard to understand finance, markets, risk, and how investment decisions worked. By late 2020, the JPMorgan Chase application trail was in my inbox. In " + jpmStart + ", the analyst chapter became real.",
    "",
    "I spent about 3.5 years inside that finance identity. Risk analysis, credit, banking, underwriting, investment logic. It shaped how I think.",
    "",
    "Then something changed. I did not just want to analyze systems. I wanted to build them. The emails changed too. Fewer pure finance signals. More engineering, AI, automation, agent workflows, founder/recruiter messages, and roles that map to the things I was actually making.",
    "",
    "This chart is basically a GitHub star chart for career signal. It is not revenue. It is not customers. It is not proof of anything by itself. But it is a strange little mirror: output changes identity, identity changes network, network changes inbound signal.",
    "",
    "Now in 2026, I am building NodeBench, a Gmail workspace, and agentic tools that turn messy inputs into decisions. Recruiter signals are moving toward that builder identity.",
    "",
    "I hope the next version of this chart is not recruiter inbound. I hope it is revenue, users, and paying customers.",
    "",
    "Either way, the direction is visible now.",
  ].join("\n");
}

function renderHtml(report) {
  const chart = renderSvg(report.series, report.milestones);
  const yearlyRows = report.yearly.map((row) => `
    <tr>
      <td>${escapeHtml(row.year)}</td>
      <td>${row.total}</td>
      <td>${row.directRecruiter}</td>
      <td>${row.jobAlerts}</td>
      <td>${row.financeRisk}</td>
      <td>${row.engineeringDev}</td>
      <td>${row.aiAgent}</td>
    </tr>`).join("");
  const milestoneCards = report.milestones.map((item) => `
    <div class="milestone">
      <div class="date">${escapeHtml(item.date)}</div>
      <strong>${escapeHtml(item.label)}</strong>
      <p>${escapeHtml(item.detail)}</p>
    </div>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Job Recruiter Signal Journey</title>
  <style>
    :root {
      --bg: #f6f8fa;
      --panel: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #d8dee4;
      --green: #1f883d;
      --blue: #0969da;
      --purple: #8250df;
      --orange: #bc4c00;
      --shadow: 0 18px 60px rgba(15, 23, 42, 0.08);
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 56px; }
    .hero { display: grid; grid-template-columns: 1.3fr .7fr; gap: 20px; align-items: stretch; }
    .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 8px; box-shadow: var(--shadow); }
    .intro { padding: 24px; }
    .eyebrow { color: var(--green); font-weight: 700; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 8px 0 10px; font-size: 32px; line-height: 1.08; letter-spacing: 0; }
    .sub { color: var(--muted); max-width: 760px; }
    .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 14px; }
    .stat { border: 1px solid var(--border); border-radius: 8px; padding: 14px; background: #fbfdff; }
    .stat span { color: var(--muted); font-size: 12px; display: block; }
    .stat strong { font-size: 28px; letter-spacing: 0; }
    .chart-panel { margin-top: 20px; padding: 18px 18px 10px; }
    .legend { display: flex; flex-wrap: wrap; gap: 16px; color: var(--muted); font-size: 12px; margin: 12px 2px 0; }
    .dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 6px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
    .section { padding: 18px; }
    h2 { margin: 0 0 12px; font-size: 18px; }
    .milestones { display: grid; gap: 10px; }
    .milestone { border: 1px solid var(--border); border-radius: 8px; padding: 12px; background: #fbfdff; }
    .milestone .date { color: var(--muted); font-size: 12px; font-weight: 700; }
    .milestone p { margin: 4px 0 0; color: var(--muted); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 8px; border-bottom: 1px solid var(--border); text-align: right; }
    th:first-child, td:first-child { text-align: left; }
    th { color: var(--muted); font-size: 12px; font-weight: 600; }
    pre { white-space: pre-wrap; margin: 0; font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #1f2937; background: #f8fafc; border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
    .note { color: var(--muted); font-size: 12px; margin-top: 10px; }
    @media (max-width: 900px) { .hero, .grid { grid-template-columns: 1fr; } h1 { font-size: 26px; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="panel intro">
        <div class="eyebrow">Gmail career signal analysis</div>
        <h1>From finance/risk identity to AI builder identity</h1>
        <p class="sub">A GitHub star-history-style view of job, recruiter, and role signals in the inbox since 2021. Counts are email-derived signals, not job outcomes, revenue, or customers.</p>
      </div>
      <div class="panel stats">
        <div class="stat"><span>Total career signals</span><strong>${report.insights.totalSignals}</strong></div>
        <div class="stat"><span>AI / agent signals</span><strong>${report.insights.aiSignals}</strong></div>
        <div class="stat"><span>Finance / risk signals</span><strong>${report.insights.financeSignals}</strong></div>
        <div class="stat"><span>Peak signal year</span><strong>${escapeHtml(report.insights.peakYear ?? "")}</strong></div>
      </div>
    </section>

    <section class="panel chart-panel">
      ${chart}
      <div class="legend">
        <span><i class="dot" style="background:var(--green)"></i>Cumulative career/recruiter signals</span>
        <span><i class="dot" style="background:var(--blue)"></i>Cumulative AI/agent signals</span>
        <span><i class="dot" style="background:var(--orange)"></i>Cumulative finance/risk signals</span>
      </div>
      <p class="note">Generated from local Gmail metadata, subjects, snippets, and lane classifications. Raw email bodies were not exported.</p>
    </section>

    <section class="grid">
      <div class="panel section">
        <h2>Milestones</h2>
        <div class="milestones">${milestoneCards}</div>
      </div>
      <div class="panel section">
        <h2>Yearly Signals</h2>
        <table>
          <thead><tr><th>Year</th><th>Total</th><th>Direct</th><th>Alerts</th><th>Finance</th><th>Eng</th><th>AI</th></tr></thead>
          <tbody>${yearlyRows}</tbody>
        </table>
      </div>
    </section>

    <section class="panel section" style="margin-top:20px">
      <h2>Post Draft</h2>
      <pre>${escapeHtml(report.postDraft)}</pre>
    </section>
  </main>
</body>
</html>`;
}

function renderSvg(series, milestones) {
  const width = 1120;
  const height = 430;
  const pad = { left: 58, right: 26, top: 34, bottom: 50 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxY = Math.max(10, ...series.map((row) => row.cumulativeTotal));
  const x = (i) => pad.left + (series.length <= 1 ? 0 : (i / (series.length - 1)) * plotW);
  const y = (v) => pad.top + plotH - (v / maxY) * plotH;
  const pathFor = (key) => series.map((row, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(row[key]).toFixed(1)}`).join(" ");
  const area = `${pathFor("cumulativeTotal")} L ${x(series.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const yearTicks = series
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row.month.endsWith("-01"));
  const yTicks = [0, .25, .5, .75, 1].map((p) => Math.round(maxY * p));
  const milestoneNodes = milestones
    .filter((m) => m.date >= series[0].month && m.date <= series.at(-1).month)
    .map((m, idx) => {
      const index = Math.max(0, series.findIndex((row) => row.month >= m.date));
      const xx = x(index);
      const yy = y(series[index]?.cumulativeTotal ?? 0);
      const labelY = 22 + (idx % 3) * 18;
      return `<line x1="${xx}" x2="${xx}" y1="${pad.top}" y2="${pad.top + plotH}" stroke="#d8dee4" stroke-dasharray="4 5"/>
        <circle cx="${xx}" cy="${yy}" r="4" fill="#8250df"/>
        <text x="${Math.min(xx + 6, width - 210)}" y="${labelY}" fill="#57606a" font-size="11">${escapeHtml(m.label)}</text>`;
    }).join("");

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Cumulative job recruiter signal trend">
    <rect width="${width}" height="${height}" rx="8" fill="#ffffff"/>
    ${yTicks.map((tick) => `<line x1="${pad.left}" x2="${width - pad.right}" y1="${y(tick)}" y2="${y(tick)}" stroke="#eaeef2"/><text x="10" y="${y(tick) + 4}" fill="#57606a" font-size="11">${tick}</text>`).join("")}
    ${yearTicks.map(({ row, i }) => `<line x1="${x(i)}" x2="${x(i)}" y1="${pad.top}" y2="${height - pad.bottom}" stroke="#f0f3f6"/><text x="${x(i) - 12}" y="${height - 18}" fill="#57606a" font-size="11">${row.month.slice(0, 4)}</text>`).join("")}
    <path d="${area}" fill="#2da44e" opacity="0.10"/>
    <path d="${pathFor("cumulativeTotal")}" fill="none" stroke="#1f883d" stroke-width="3"/>
    <path d="${pathFor("cumulativeAiAgent")}" fill="none" stroke="#0969da" stroke-width="2"/>
    <path d="${pathFor("cumulativeFinanceRisk")}" fill="none" stroke="#bc4c00" stroke-width="2"/>
    ${series.map((row, i) => row.total > 0 ? `<rect x="${x(i) - 2}" y="${height - pad.bottom - Math.min(48, row.total * 2)}" width="4" height="${Math.min(48, row.total * 2)}" fill="#1f883d" opacity="0.28"/>` : "").join("")}
    ${milestoneNodes}
  </svg>`;
}

function emptyBucket(month) {
  return {
    month,
    total: 0,
    weighted: 0,
    directRecruiter: 0,
    jobAlerts: 0,
    financeRisk: 0,
    engineeringDev: 0,
    aiAgent: 0,
  };
}

function addCumulative(rows, key, outKey) {
  let total = 0;
  for (const row of rows) {
    total += row[key] ?? 0;
    row[outKey] = total;
  }
}

function monthRange(start, end) {
  const out = [];
  const cursor = new Date(`${start}-01T00:00:00Z`);
  const last = new Date(`${end}-01T00:00:00Z`);
  while (cursor <= last) {
    out.push(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, "\"");
}

function cleanSubject(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
}

function cleanSender(name, addr) {
  const label = name || addr || "unknown";
  return String(label).replace(/\s+/g, " ").trim().slice(0, 80);
}

function groupBy(items, fn) {
  const map = new Map();
  for (const item of items) {
    const key = fn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

function sum(items, key) {
  return items.reduce((acc, item) => acc + (item[key] ?? 0), 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

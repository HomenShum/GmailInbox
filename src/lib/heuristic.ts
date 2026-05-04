import type { Lane } from "./lanes";

interface Rule {
  pattern: RegExp;
  field: "from" | "subject" | "either";
  lane: Lane;
  urgency: number;
  confidence: number;
}

// Rules ordered most-specific first. First match wins.
const RULES: Rule[] = [
  // Money
  { pattern: /(chase\.com|americanexpress|capitalone|wellsfargo|bofa\.com|bankofamerica)/i, field: "from", lane: "money", urgency: 0.5, confidence: 0.95 },
  { pattern: /(venmo|paypal|zelle)/i, field: "from", lane: "money", urgency: 0.45, confidence: 0.9 },
  { pattern: /\b(statement|payment due|autopay|balance)\b/i, field: "subject", lane: "money", urgency: 0.5, confidence: 0.75 },

  // Dev / CI
  { pattern: /(noreply@github\.com|notifications@github\.com|vercel\[bot\]|@vercel\.com|npm|pipedream|openai\.com.*platform|cloudflare)/i, field: "from", lane: "dev_ci", urgency: 0.5, confidence: 0.92 },
  { pattern: /\b(run failed|PR #|workflow run|deploy(ed|ment)|build failed|merge conflict)\b/i, field: "subject", lane: "dev_ci", urgency: 0.6, confidence: 0.85 },

  // Job alerts (broadcast)
  { pattern: /(jobs-noreply@linkedin|linkedin.*alerts|careerbuilder|indeed\.com|ziprecruiter|jobalerts|glassdoor)/i, field: "from", lane: "job_alerts", urgency: 0.15, confidence: 0.95 },
  { pattern: /\bjob alert(s)?\b|\b\d+ new (jobs|matches)\b|\bnew (jobs?|opportunities)\b/i, field: "subject", lane: "job_alerts", urgency: 0.2, confidence: 0.8 },

  // Career (inbound recruiter — soft signals)
  { pattern: /\b(opportunity|role at|reaching out|founding engineer|hiring|open role)\b/i, field: "subject", lane: "career", urgency: 0.6, confidence: 0.6 },

  // Subscriptions
  { pattern: /(squarespace|classpass|netflix|spotify|notion\.so|figma|github\.com.*billing|stripe.*invoice)/i, field: "from", lane: "subscriptions", urgency: 0.3, confidence: 0.9 },
  { pattern: /\b(renews?|subscription|invoice|receipt)\b/i, field: "subject", lane: "subscriptions", urgency: 0.3, confidence: 0.7 },

  // Shopping
  { pattern: /(amazon\.com|order-update|shipment|tracking|fedex|ups\.com|usps|ebay|shopify)/i, field: "from", lane: "shopping", urgency: 0.3, confidence: 0.9 },
  { pattern: /\b(order #|your order|shipped|delivery|tracking number)\b/i, field: "subject", lane: "shopping", urgency: 0.35, confidence: 0.85 },

  // Travel / Auto
  { pattern: /(mazda|toyota|honda|tesla|airbnb|booking\.com|expedia|united\.com|delta\.com|americanairlines|hertz|enterprise)/i, field: "from", lane: "travel_auto", urgency: 0.4, confidence: 0.9 },
  { pattern: /\b(flight|reservation|confirmation #|hotel|service appointment)\b/i, field: "subject", lane: "travel_auto", urgency: 0.5, confidence: 0.8 },

  // Reading list
  { pattern: /(substack|beehiiv|producthunt|the-frontier|newsletter|digest@|noreply.*medium|hackernews)/i, field: "from", lane: "reading", urgency: 0.1, confidence: 0.85 },
  { pattern: /\b(weekly|digest|newsletter|this week in)\b/i, field: "subject", lane: "reading", urgency: 0.15, confidence: 0.7 },

  // Auto-archive (promo)
  { pattern: /(deals@|promo@|marketing@|offers@|news@|noreply.*promo)/i, field: "from", lane: "auto_archive", urgency: 0.05, confidence: 0.85 },
  { pattern: /\b(off!|sale|limited time|last chance|free entry|win \$|% off|earn \$)/i, field: "subject", lane: "auto_archive", urgency: 0.05, confidence: 0.7 },
];

export interface HeuristicResult {
  lane: Lane;
  urgency: number;
  confidence: number;
  rule: string;
}

export function heuristicClassify(from: string, subject: string): HeuristicResult | null {
  const fromL = from.toLowerCase();
  const subL = subject.toLowerCase();
  for (const r of RULES) {
    const target =
      r.field === "from" ? fromL :
      r.field === "subject" ? subL :
      `${fromL} ${subL}`;
    if (r.pattern.test(target)) {
      return {
        lane: r.lane,
        urgency: r.urgency,
        confidence: r.confidence,
        rule: `${r.field}~${r.pattern.source.slice(0, 40)}`,
      };
    }
  }
  return null;
}

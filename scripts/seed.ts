#!/usr/bin/env bun
/**
 * Seed the local SQLite store with synthetic emails that mirror realistic
 * inbox patterns without committing private account data.
 *
 * Then runs the heuristic classifier so the dashboard has data to render
 * on first load.
 */

import { db, upsertClassification } from "../src/lib/db";
import { heuristicClassify } from "../src/lib/heuristic";
import { LANES } from "../src/lib/lanes";

interface Seed {
  from_addr: string;
  from_name: string;
  subject: string;
  snippet: string;
  body?: string;
  hours_ago: number;
}

const SEEDS: Seed[] = [
  // Career — inbound recruiters (high signal)
  { from_addr: "patty.shinn@example-recruiting.com", from_name: "Patty Shinn", subject: "Agentic AI Leader - Remote - Opportunity",
    snippet: "Hi Alex, Your background in Agentic AI Development caught my eye. We have a fully remote Agentic AI Leader role with $250-300k base...",
    body: "Hi Alex,\n\nYour background in Agentic AI Development caught my eye. We have a fully remote Agentic AI Leader role at a Series-B fintech AI startup with $250-300k base + equity. Building autonomous workflow agents on top of LLM toolchains.\n\nWould love a 15-minute call this week. Available Wed/Thu afternoons?\n\n- Patty Shinn, Talent Partner", hours_ago: 1.2 },
  { from_addr: "bona.bytyci@example-startup.com", from_name: "Bona Bytyci", subject: "Founding Engineer Role - Alex | Bona",
    snippet: "Hi Alex, I am currently working on a Founding Backend role at an early-stage AI startup in the US, and I think you could be a strong match...",
    body: "Hi Alex,\n\nI'm working on a Founding Backend role at an early-stage AI startup in the US. They're looking for someone strong in agentic systems + Python/TypeScript backends. Pre-seed but fully funded by tier-1 VCs.\n\nInterested in a quick chat?\n\n- Bona", hours_ago: 25 },
  { from_addr: "lori.rouleau@example-narrative.ai", from_name: "Lori Rouleau", subject: "AI Engineer — $210K-$350K (Narrative, Series A, Fintech AI)",
    snippet: "Hi Alex - I'm building the AI engineering team at Narrative and your background caught my eye.", hours_ago: 26 },
  { from_addr: "randi.wuhl@example-reflow.ai", from_name: "Randi Wuhl", subject: "AI Engineer Opportunity | Reflow",
    snippet: "Hi Alex, Shooting my shot here, and hoping to connect with you! We are motivated to find a seasoned and strong AI Engineer at Reflow.ai", hours_ago: 27 },
  { from_addr: "chris.decrescenzo@aboon.example", from_name: "Chris Decrescenzo", subject: "Alex <> Chris",
    snippet: "Hi Alex, I'm working with the leadership at Aboon (aboon.com) to help them find a SWE AI/Agents.", hours_ago: 27 },
  { from_addr: "jordan.lowe@samba-tv.example", from_name: "Jordan Lowe", subject: "AI at Samba TV",
    snippet: "Hi Alex, I hope you're doing well. I came across your profile...", hours_ago: 30 },

  // LinkedIn job alerts (broadcast)
  { from_addr: "jobs-noreply@linkedin.com", from_name: "LinkedIn Job Alerts", subject: "Senior Credit Underwriting Analyst at Jobgether",
    snippet: "Jobgether Senior Credit Underwriting Analyst: This position is posted by Jobgether on behalf of…", hours_ago: 27 },
  { from_addr: "jobs-noreply@linkedin.com", from_name: "LinkedIn Job Alerts", subject: "Data Scientist at Semgrep",
    snippet: "Semgrep Data Scientist: About SemgrepSemgrep, the leader in code security…", hours_ago: 27 },
  { from_addr: "jobs-noreply@linkedin.com", from_name: "LinkedIn Job Alerts", subject: "Research Engineer, Reward Models Platform at Anthropic",
    snippet: "Anthropic Research Engineer, Reward Models Platform: About AnthropicAnthropic's mission is to create…", hours_ago: 27 },
  { from_addr: "jobs-noreply@linkedin.com", from_name: "LinkedIn Job Alerts", subject: "Generative AI Applications Engineer (Agents & RAG) at RemoteHunter",
    snippet: "RemoteHunter Generative AI Applications Engineer (Agents & RAG): 1. About Our Client:The organization operates in…", hours_ago: 13 },
  { from_addr: "jobs-noreply@linkedin.com", from_name: "LinkedIn Job Alerts", subject: "Data Scientist at Adobe",
    snippet: "Adobe Data Scientist: The Opportunity Join our dedicated team at Adobe…", hours_ago: 30 },
  { from_addr: "jobs-noreply@linkedin.com", from_name: "LinkedIn Job Alerts", subject: "\"Forward deploy engineer\": OpenAI - Forward Deployed Engineer (FDE), Life Sciences - SF posted on 4/26/26",
    snippet: "View jobs in San Francisco Bay Area", hours_ago: 28 },
  { from_addr: "alerts@careerbuilder.example", from_name: "Careerbuilder", subject: "New jobs alert for Team Lead, NLP Engineer, San Francisco, California",
    snippet: "Your job alerts You have new matches for your job alert: \"Team Lead, NLP Engineer\"…", hours_ago: 31 },
  { from_addr: "jobs-noreply@linkedin.com", from_name: "LinkedIn Job Alerts", subject: "Sr. Credit Risk Analyst at Prosper Marketplace",
    snippet: "Prosper Marketplace Sr. Credit Risk Analyst: Your role in our missionThe successful candidate…", hours_ago: 29 },
  { from_addr: "jobs-noreply@linkedin.com", from_name: "LinkedIn Job Alerts", subject: "AI Deployment Engineer- Startups at OpenAI",
    snippet: "OpenAI AI Deployment Engineer- Startups: About The TeamThe AI Deployment Engineering team is at…", hours_ago: 30 },

  // Dev / CI
  { from_addr: "noreply@github.com", from_name: "Demo Builder", subject: "[example-org/agent-workspace] Run failed: Notebook daily summary - main (31354b0)",
    snippet: "[example-org/agent-workspace] Notebook daily summary workflow run Notebook daily summary: All jobs have failed View workflow run", hours_ago: 5 },
  { from_addr: "noreply@github.com", from_name: "Demo Builder", subject: "[example-org/agent-workspace] Run failed: Dogfood Visual QA Gate - main (31354b0)",
    snippet: "All jobs have failed View workflow run Status Job Annotations Dogfood Visual QA Gate-stage1: Process completed with exit code 1", hours_ago: 13 },
  { from_addr: "vercel[bot]@noreply.github.com", from_name: "vercel[bot]", subject: "Re: [example-org/agent-workspace] fix(chat): restore canonical chat headers (PR #207)",
    snippet: "vercel[bot] left a comment (example-org/agent-workspace#207). The latest updates on your projects.", hours_ago: 26 },
  { from_addr: "noreply@github.com", from_name: "Demo Builder", subject: "[example-org/agent-workspace] Run failed: Post-Deploy Verify - main (31354b0)",
    snippet: "Post-Deploy Verify workflow run Post-Deploy Verify: All jobs have failed", hours_ago: 13 },
  { from_addr: "noreply@github.com", from_name: "Demo Builder", subject: "[example-org/agent-workspace] PR run failed: PR style - feat(finance) examples B/C/D + real-PDF + chat overlay",
    snippet: "PR style workflow run PR style: Some annotations…", hours_ago: 13 },
  { from_addr: "support@npmjs.com", from_name: "npm", subject: "[npm] Granular access tokens expiring in 7 days",
    snippet: "[npm] Granular access tokens expiring in 7 days Hi demo-user, please note that your token expires soon.", hours_ago: 27 },
  { from_addr: "team@pipedream.example", from_name: "Pipedream", subject: "[pipedream] Error in workflow test (p_k2CkepZ) at 3:58:24 PM GMT",
    snippet: "Your workflow generated the following error at 3:58:24 PM GMT on Wed, Apr 29, 2026: NotFoundError — Error code: 404", hours_ago: 2 },
  { from_addr: "hello@kilo.example", from_name: "Kilo Team", subject: "Kilo: live swag store build, new models, and VS Code updates",
    snippet: "Hey there! This week: a special livestream series kicks off tomorrow…", hours_ago: 0.4 },

  // Money
  { from_addr: "no.reply@chase.com", from_name: "Chase", subject: "Your credit card statement is available",
    snippet: "Statement ready Your credit card statement is available Account Chase Credit Card (...6961) Due date 05/25/2026 Minimum payment due $40.00 Statement balance $3309.98 Auto-pay enabled",
    body: "Statement ready\nAccount: Chase Credit Card (...6961)\nDue date: 05/25/2026\nMinimum payment: $40.00\nStatement balance: $3309.98\nAuto-pay: enabled\n\nView statement at chase.com.",
    hours_ago: 14 },
  { from_addr: "venmo@venmo.com", from_name: "Venmo", subject: "Still thinking about that 5% cash back?",
    snippet: "We get it. Earn up to 5% always-on cash back on a bundle of brands you love with the Venmo Debit Card.", hours_ago: 31 },

  // Subscriptions
  { from_addr: "noreply@squarespace.com", from_name: "Squarespace", subject: "Your Squarespace Domain cafecorner.space renews soon.",
    snippet: "Squarespace domains Your Squarespace Domain renews soon. Hi Alex, as a friendly reminder, your domain is set to auto-renew soon.", hours_ago: 26 },
  { from_addr: "domains-noreply@google.com", from_name: "The Google Workspace Team", subject: "Domain registration for cafecorner.space renews on May 21, 2026.",
    snippet: "Your domain name, cafecorner.space, is configured for automatic renewal with registrar, squarespace, on May 21, 2026.", hours_ago: 31 },
  { from_addr: "events@stripe.com", from_name: "Sessions Registration", subject: "[Stripe Sessions] Day one",
    snippet: "Stripe Sessions Day one: What's happening Get a first look at upcoming launches in our opening keynote at 9:15 am…", hours_ago: 4 },
  { from_addr: "events@stripe.com", from_name: "Sessions Registration", subject: "Stripe Sessions starts tomorrow at 9:15 am",
    snippet: "Stripe Sessions We look forward to seeing you tomorrow morning at Moscone West.", hours_ago: 31 },
  { from_addr: "no-reply@classpass.com", from_name: "ClassPass", subject: "Your upcoming reservation at On One Studios 🎉",
    snippet: "Open for more details.", hours_ago: 27 },

  // Shopping
  { from_addr: "no-reply@happenings.amazon.com", from_name: "Amazon", subject: "450PCS FIVEIZERO Assorted Acrylic Beads for Bracelet Making — Expected tomorrow",
    snippet: "Order arriving tomorrow. View order details on Amazon.", hours_ago: 9 },

  // Travel / Auto
  { from_addr: "info@capitolmazda.example", from_name: "CAPITOL MAZDA SERVICE", subject: "Appointment Scheduled: Capitol Mazda appointment on Apr 28, 2026 11:45:00 AM",
    snippet: "Details for your appointment at Capitol Mazda on Apr 28, 2026 11:45:00 AM. APPOINTMENT CONFIRMATION Hello Alex, thank you for taking...", hours_ago: 27 },
  { from_addr: "info@mazda.example", from_name: "Mazda", subject: "Your Mazda Is Due for Service + Complimentary Car Wash",
    snippet: "Mazda View this email in your browser YOUR MAZDA DESERVES EXPERT CARE Let us maintain your driving passion with meticulous service…", hours_ago: 27 },
  { from_addr: "noreply@disneyland.example", from_name: "Disney Debit", subject: "Disney Debit: Visit Kylo Ren and the Dark Side at the Disneyland® Resort!",
    snippet: "Capture galactic memories at the Cardmember location at the Disneyland ® Resort!", hours_ago: 1 },

  // Reading list
  { from_addr: "newsletter@ai-builder-club.example", from_name: "AI Builder Club (Skool)", subject: "Weekly digest for Tue, Apr 21 2026",
    snippet: "AI Builder Club skool logo Weekly Digest For Tue, Apr 21 2026 4 posts • 0 comments • 0 new members…", hours_ago: 5.5 },
  { from_addr: "team@thelinkup.example", from_name: "The Linkup Team", subject: "Linkup update — /tasks endpoint release & pricing update",
    snippet: "Hi there, Here's a quick update on what's new at Linkup: TL;DR — We just released our asynchronous batch endpoint /tasks…", hours_ago: 7 },
  { from_addr: "newsletter@thefrontier.example", from_name: "The Frontier by Pro", subject: "Claude vs ChatGPT — Plus, five AI tools you may have missed",
    snippet: "Plus, five AI tools you may have missed", hours_ago: 27 },
  { from_addr: "newsletter@manus.example", from_name: "Manus", subject: "What if your trading tools could build their own dashboards?",
    snippet: "See how Manus analyzed AAPL across 4 timeframes and deployed a live web report…", hours_ago: 6 },
  { from_addr: "newsletter@producthunt.com", from_name: "Product Hunt Daily", subject: "🐌 Your sleep score is guesswork",
    snippet: "Plus AI evals without the annotation work, and Netflix launched a database…", hours_ago: 7 },
  { from_addr: "founders@dwayne-campbell.example", from_name: "Dwayne Campbell", subject: "We're excited to welcome Abhijith Neelamchalli, SF Venture Lead at Legendary Ventures",
    snippet: "We're excited to welcome Abhijith Neelamchalli, SF Venture Lead at Legendary Ventures, to The Deal Lounge: Series A+ & Growth-Stage Funds Edition.", hours_ago: 7.4 },
  { from_addr: "ollama@ollama.example", from_name: "Ollama", subject: "DeepSeek V4 Pro is now available on Ollama's cloud",
    snippet: "DeepSeek-V4-Pro is now available to run on Ollama's cloud using the latest NVIDIA Blackwell hardware.", hours_ago: 27 },

  // Auto-archive (promo / TOS)
  { from_addr: "tos@rakuten.example", from_name: "Rakuten Viki", subject: "Viki's Terms of Use and Policies Updates",
    snippet: "Rakuten Viki Viki's Terms of Use and Policies Updates Hey there, Effective April 8 2026, we're updating our Terms of Use…", hours_ago: 26 },
  { from_addr: "promo@questhealth.example", from_name: "Quest", subject: "🤧 Don't miss 20% off select allergy tests",
    snippet: "Limited-time sale: Breathe easier with Quest SAVE up to 20%* AT QUESTHEALTH.COM…", hours_ago: 7.5 },
  { from_addr: "deals@luckyrewards.example", from_name: "Lucky Rewards", subject: "Free Entry for a chance to win $35,000!",
    snippet: "Race over for big savings - don't miss out!", hours_ago: 8 },
  { from_addr: "promo@aiify.example", from_name: "Aiify.io Events", subject: "🥳 ClawCamp Campout - 5/11 @ AI INFRA; ClawCamp Human+Tech Week Opener - 5/11; ClawCamp Weekly Campfires - Starting 5/4",
    snippet: "ClawCamp Campout - 5/11 @ AI INFRA; ClawCamp Human+Tech Week Opener", hours_ago: 27 },
  { from_addr: "promo@chase.com", from_name: "Chase", subject: "Need a gift? Check cash back offers first",
    snippet: "Earn on gifts for Mother's Day, Father's day, graduations and weddings.", hours_ago: 27 },

  // Reading / events
  { from_addr: "events@ticketweb.example", from_name: "TicketWeb", subject: "Forester, Blu & Exile, The Dear Hunter in San Francisco",
    snippet: "Discover the shows everyone's talking about before they're gone…", hours_ago: 28 },
  { from_addr: "events@sfvibe.example", from_name: "SFVibe", subject: "The City's about to flex.",
    snippet: "April 28th - May 4th", hours_ago: 27 },
  { from_addr: "stephen@intelligence.example", from_name: "Stephen Messer", subject: "Join me on Intelligence.com",
    snippet: "A new way to connect in business I just joined intelligence.com, a professional network…", hours_ago: 28 },

  // Free Leland (training)
  { from_addr: "events@leland.example", from_name: "Free Leland Events", subject: "You are invited to Identifying Key Metrics using AI for Data and Analytics",
    snippet: "Join Ryan S., Data Scientist and Engineer at Accenture with deep expertise in AI analytics", hours_ago: 26 },
];

function nowSec(): number { return Math.floor(Date.now() / 1000); }

const d = db();

const tx = d.transaction(() => {
  // Wipe seed data on re-run for idempotence
  d.prepare("DELETE FROM classifications").run();
  d.prepare("DELETE FROM emails").run();
  d.prepare("DELETE FROM actions").run();

  const stmt = d.prepare(`
    INSERT INTO emails (id, thread_id, from_addr, from_name, to_addrs, subject, snippet, body, internal_date, labels, is_unread)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  let i = 0;
  for (const s of SEEDS) {
    const id = `seed_${(i++).toString().padStart(4, "0")}`;
    const internal_date = nowSec() - Math.floor(s.hours_ago * 3600);
    stmt.run(id, id, s.from_addr, s.from_name, "alex@example.com", s.subject, s.snippet, s.body ?? null, internal_date, "INBOX");
  }
});
tx();

console.log(`seeded ${SEEDS.length} emails`);

// Run heuristic classifier
const rows = d.prepare("SELECT id, from_addr, subject FROM emails").all() as { id: string; from_addr: string; subject: string }[];
let classified = 0, triaged = 0;
for (const e of rows) {
  const r = heuristicClassify(e.from_addr, e.subject);
  upsertClassification({
    email_id: e.id,
    lane: r?.lane ?? "triage",
    urgency: r?.urgency ?? 0.5,
    action: r?.lane === "auto_archive" ? "archive" : "none",
    confidence: r?.confidence ?? 0.3,
    model: r ? "heuristic" : "fallback_triage",
    rationale: r?.rule ?? "no rule matched",
  });
  classified++;
  if (!r) triaged++;
}
console.log(`classified ${classified} (${triaged} fell through to triage)`);

// lane distribution
const counts = d.prepare(`
  SELECT lane, COUNT(*) AS n FROM classifications
  GROUP BY lane ORDER BY n DESC
`).all() as { lane: string; n: number }[];
console.log("lane distribution:");
for (const c of counts) {
  const meta = LANES.includes(c.lane as any) ? c.lane : "(invalid)";
  console.log(`  ${meta.padEnd(16)} ${c.n}`);
}

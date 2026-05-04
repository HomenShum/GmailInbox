// Lane taxonomy. Bounded enum, not a free string.
export const LANES = [
  "reply_now",
  "career",
  "job_alerts",
  "dev_ci",
  "money",
  "subscriptions",
  "shopping",
  "travel_auto",
  "reading",
  "auto_archive",
  "triage",
] as const;

export type Lane = (typeof LANES)[number];

export const LANE_META: Record<Lane, { title: string; tone: string; emoji: string; description: string }> = {
  reply_now: { title: "Needs Reply", tone: "#ef4444", emoji: "!", description: "Messages where you may owe a response" },
  career: { title: "Career", tone: "#7c5cff", emoji: "*", description: "Recruiters, interviews, and opportunities" },
  job_alerts: { title: "Job Emails", tone: "#475569", emoji: "#", description: "Roles and job alerts to review in batches" },
  dev_ci: { title: "Dev / CI", tone: "#2dd4a4", emoji: ">", description: "GitHub, Vercel, npm, and build messages" },
  money: { title: "Money", tone: "#f5b942", emoji: "$", description: "Banks, statements, refunds, and bills" },
  subscriptions: { title: "Subscriptions", tone: "#06b6d4", emoji: "R", description: "Recurring renewals and memberships" },
  shopping: { title: "Shopping", tone: "#ec4899", emoji: "P", description: "Orders, packages, and tracking" },
  travel_auto: { title: "Travel / Auto", tone: "#a3e635", emoji: "T", description: "Travel, car, bookings, and service" },
  reading: { title: "Reading List", tone: "#94a3b8", emoji: "N", description: "Newsletters and digests" },
  auto_archive: { title: "Safe Archive", tone: "#3f3f46", emoji: "A", description: "Likely safe to archive after review" },
  triage: { title: "Label Review", tone: "#fbbf24", emoji: "?", description: "Uncertain labels that need a human check" },
};

export const ACTIONS = ["reply", "archive", "snooze", "label", "delete", "none"] as const;
export type Action = (typeof ACTIONS)[number];

export function isLane(s: string): s is Lane {
  return (LANES as readonly string[]).includes(s);
}

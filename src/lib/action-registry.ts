export type WorkspaceRouteKind =
  | "today"
  | "inbox"
  | "calendar"
  | "goals"
  | "settings";

export type WorkspaceActionGroup = "Navigate" | "Inbox" | "Agent" | "Review" | "Settings";

export interface WorkspaceAction {
  id: string;
  label: string;
  description: string;
  group: WorkspaceActionGroup;
  href?: string;
  shortcut?: string;
  agentPrompt?: string;
  pageKinds?: WorkspaceRouteKind[];
  keywords?: string[];
  requiresApproval?: boolean;
}

export const WORKSPACE_ACTIONS: WorkspaceAction[] = [
  {
    id: "nav-today",
    label: "Open Today",
    description: "Start here for the next safe action.",
    group: "Navigate",
    href: "/",
    shortcut: "g t",
    keywords: ["dashboard", "home", "pulse", "briefing", "start"],
  },
  {
    id: "nav-inbox",
    label: "Open Inbox",
    description: "Read, search, and review email queues.",
    group: "Navigate",
    href: "/inbox",
    shortcut: "g i",
    keywords: ["mail", "email", "triage"],
  },
  {
    id: "nav-calendar",
    label: "Open Calendar",
    description: "Review time blocks, follow-ups, and deadlines.",
    group: "Navigate",
    href: "/calendar",
    shortcut: "g c",
    keywords: ["schedule", "blocks", "deadline"],
  },
  {
    id: "nav-goals",
    label: "Open Goals",
    description: "Track annual, quarter, month, week, and todos.",
    group: "Navigate",
    href: "/goals",
    shortcut: "g g",
    keywords: ["planner", "progress", "career", "admin", "analytics", "todos"],
  },
  {
    id: "nav-settings",
    label: "Open Settings",
    description: "Configure Gmail, pinned files, automations, models, and privacy.",
    group: "Navigate",
    href: "/settings",
    shortcut: "g s",
    keywords: ["config", "gmail", "model", "automation", "advanced"],
  },
  {
    id: "inbox-reply",
    label: "Review Replies Due",
    description: "Open emails where you may owe a response.",
    group: "Inbox",
    href: "/inbox?tab=reply_now",
    pageKinds: ["today", "inbox"],
    keywords: ["reply", "respond", "follow-up"],
  },
  {
    id: "inbox-career",
    label: "Review Career Mail",
    description: "Open recruiters, opportunities, and job emails.",
    group: "Inbox",
    href: "/inbox?tab=career",
    pageKinds: ["today", "inbox", "goals"],
    keywords: ["career", "jobs", "roles", "linkedin"],
  },
  {
    id: "inbox-admin",
    label: "Review Bills And Admin",
    description: "Open money, tax, subscription, travel, and logistics messages.",
    group: "Inbox",
    href: "/inbox?tab=admin",
    pageKinds: ["today", "inbox", "goals"],
    keywords: ["tax", "money", "personal", "admin"],
  },
  {
    id: "inbox-triage",
    label: "Review Uncertain Labels",
    description: "Check labels before automation uses them.",
    group: "Inbox",
    href: "/inbox?tab=triage",
    pageKinds: ["today", "inbox", "calendar", "goals"],
    keywords: ["decide", "classification", "uncertain"],
  },
  {
    id: "agent-current-page",
    label: "Ask Agent: What Matters Here?",
    description: "Summarize the current view and propose the next action.",
    group: "Agent",
    agentPrompt: "Look at the current workspace context and tell me the highest-leverage next action, with evidence.",
    pageKinds: ["today", "inbox", "calendar", "goals", "settings"],
    keywords: ["explain", "next", "summarize"],
  },
  {
    id: "agent-daily-pulse",
    label: "Ask Agent: Generate Daily Pulse",
    description: "Condense email, calendar, and goals into one daily operating brief.",
    group: "Agent",
    agentPrompt: "Generate a concise daily pulse: what changed, what needs action, what can wait, what should be scheduled, and which goal it maps to.",
    pageKinds: ["today", "goals"],
    keywords: ["brief", "pulse", "daily"],
  },
  {
    id: "agent-draft-replies",
    label: "Ask Agent: Draft Replies",
    description: "Prepare drafts only. Nothing is sent.",
    group: "Agent",
    agentPrompt: "Find the highest-priority reply-now and recruiter emails, then draft concise replies for review. Do not send anything.",
    pageKinds: ["today", "inbox", "goals"],
    keywords: ["draft", "reply", "recruiter"],
  },
  {
    id: "agent-schedule-blocks",
    label: "Ask Agent: Build Schedule Blocks",
    description: "Suggest calendar blocks. Nothing is scheduled without approval.",
    group: "Agent",
    agentPrompt: "Review scheduling, deadline, and follow-up emails and propose calendar blocks. Keep all changes as suggestions unless I approve.",
    pageKinds: ["today", "calendar", "goals"],
    keywords: ["calendar", "schedule", "time"],
  },
  {
    id: "agent-career-pipeline",
    label: "Ask Agent: Review Career Pipeline",
    description: "Rank recruiters, jobs, opportunities, and follow-ups using pinned context.",
    group: "Review",
    href: "/jobs",
    agentPrompt: "Review career, recruiter, job-alert, and opportunity emails. Use pinned resume/context if available, rank what I should act on first, and explain why.",
    pageKinds: ["today", "inbox", "goals"],
    keywords: ["career", "interview", "jobs", "opportunities", "resume"],
  },
  {
    id: "settings-automations",
    label: "Open Automation Settings",
    description: "Manage local rules, suggestions, and approval behavior.",
    group: "Settings",
    href: "/settings?tab=automations",
    pageKinds: ["settings", "today"],
    keywords: ["rules", "autopilot", "advanced"],
  },
  {
    id: "settings-context",
    label: "Open Pinned Files",
    description: "Pin resumes, files, and prompts for the agent.",
    group: "Settings",
    href: "/settings?tab=context",
    pageKinds: ["settings", "today", "goals"],
    keywords: ["resume", "artifact", "context", "memory"],
  },
];

export function routeKindFromPathname(pathname: string): WorkspaceRouteKind {
  if (pathname === "/" || pathname.startsWith("/pulse") || pathname.startsWith("/briefings")) return "today";
  if (pathname.startsWith("/inbox") || pathname.startsWith("/triage")) return "inbox";
  if (pathname.startsWith("/calendar")) return "calendar";
  if (
    pathname.startsWith("/goals") ||
    pathname.startsWith("/planner") ||
    pathname.startsWith("/career") ||
    pathname.startsWith("/personal") ||
    pathname.startsWith("/jobs") ||
    pathname.startsWith("/opportunities") ||
    pathname.startsWith("/analytics")
  ) return "goals";
  if (pathname.startsWith("/settings") || pathname.startsWith("/automations")) return "settings";
  return "today";
}

export function actionsForPathname(pathname: string) {
  const kind = routeKindFromPathname(pathname);
  return WORKSPACE_ACTIONS.filter((action) => !action.pageKinds || action.pageKinds.includes(kind));
}

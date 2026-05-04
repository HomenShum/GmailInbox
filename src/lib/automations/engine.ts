import { db, listRules, logRuleRun, recordAction, upsertClassification, type AutomationRuleRow } from "@/lib/db";
import { isLane, type Lane } from "@/lib/lanes";

type EmailAutomationRow = {
  id: string;
  from_addr: string;
  from_name: string | null;
  subject: string;
  snippet: string;
  labels: string;
  is_unread: number;
  lane: string | null;
  urgency: number | null;
  confidence: number | null;
};

type Condition = { field: string; op?: string; value?: unknown };
type RuleAction = { type: string; value?: unknown };

export interface AutomationRunSummary {
  evaluated: number;
  matched: number;
  actions: number;
}

export function runAutomationsForEmails(emailIds: string[]): AutomationRunSummary {
  const ids = [...new Set(emailIds)].filter(Boolean);
  const rules = listRules(true).filter((rule) => rule.trigger === "new_email");
  if (ids.length === 0 || rules.length === 0) {
    return { evaluated: ids.length, matched: 0, actions: 0 };
  }

  let matched = 0;
  let actions = 0;
  for (const emailId of ids) {
    const email = loadEmail(emailId);
    if (!email) continue;
    for (const rule of rules) {
      if (alreadyRan(rule.id, email.id)) continue;
      const result = runRule(rule, email);
      if (result.matched) matched++;
      actions += result.actions;
    }
  }

  return { evaluated: ids.length, matched, actions };
}

function loadEmail(id: string): EmailAutomationRow | null {
  return (db().prepare(`
    SELECT e.*, c.lane, c.urgency, c.confidence
    FROM emails e
    LEFT JOIN latest_classifications c ON c.email_id = e.id
    WHERE e.id = ?
  `).get(id) ?? null) as EmailAutomationRow | null;
}

function alreadyRan(ruleId: string, target: string) {
  const row = db().prepare(`
    SELECT id FROM rule_runs
    WHERE rule_id = ? AND target = ? AND success = 1
    LIMIT 1
  `).get(ruleId, target);
  return !!row;
}

function runRule(rule: AutomationRuleRow, email: EmailAutomationRow) {
  let success = true;
  let error = "";
  let matched = false;
  let actions = 0;

  try {
    const conditions = parseJson<Condition[]>(rule.conditions, []);
    const ruleActions = parseJson<RuleAction[]>(rule.actions, []);
    matched = conditions.every((condition) => matchesCondition(email, condition));
    if (matched) {
      for (const action of ruleActions) actions += applyAction(email, rule, action);
    }
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : String(err);
  }

  if (matched || !success) {
    logRuleRun({
      rule_id: rule.id,
      trigger: rule.trigger,
      target: email.id,
      payload: JSON.stringify({ matched, actions }),
      success: success ? 1 : 0,
      error_msg: error || null,
    });
  }

  return { matched, actions };
}

function matchesCondition(email: EmailAutomationRow, condition: Condition) {
  const fieldValue = valueForField(email, condition.field);
  const op = condition.op ?? "contains";
  const expected = String(condition.value ?? "").toLowerCase();
  const actual = String(fieldValue ?? "").toLowerCase();

  if (op === "contains") return actual.includes(expected);
  if (op === "equals") return actual === expected;
  if (op === "starts_with") return actual.startsWith(expected);
  if (op === "lane_is") return actual === expected;
  if (op === "less_than") return Number(fieldValue ?? 0) < Number(condition.value ?? 0);
  if (op === "greater_than") return Number(fieldValue ?? 0) > Number(condition.value ?? 0);
  return false;
}

function valueForField(email: EmailAutomationRow, field: string) {
  if (field === "sender" || field === "from") return email.from_addr;
  if (field === "priority") return email.urgency;
  return (email as Record<string, unknown>)[field];
}

function applyAction(email: EmailAutomationRow, rule: AutomationRuleRow, action: RuleAction) {
  if (action.type === "apply_label" && typeof action.value === "string" && isLane(action.value)) {
    const lane = action.value as Lane;
    upsertClassification({
      email_id: email.id,
      lane,
      urgency: email.urgency ?? 0.5,
      action: lane === "auto_archive" ? "archive" : "none",
      confidence: Math.max(email.confidence ?? 0, 0.95),
      model: "automation",
      rationale: `automation:${rule.name}`,
    });
    recordAction(email.id, "automation_label", { rule_id: rule.id, lane });
    return 1;
  }

  if (action.type === "set_priority" && action.value === "high") {
    upsertClassification({
      email_id: email.id,
      lane: isLane(email.lane ?? "") ? email.lane as Lane : "triage",
      urgency: 0.95,
      action: "none",
      confidence: Math.max(email.confidence ?? 0, 0.9),
      model: "automation",
      rationale: `automation:${rule.name}`,
    });
    recordAction(email.id, "automation_priority", { rule_id: rule.id, priority: "high" });
    return 1;
  }

  if (action.type === "archive") {
    recordAction(email.id, "automation_archive_candidate", { rule_id: rule.id });
    return 1;
  }

  recordAction(email.id, "automation_noop", { rule_id: rule.id, action });
  return 0;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

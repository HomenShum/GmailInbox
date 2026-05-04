import { getReadModel } from "./db";
import { buildBriefingSummary, buildCalendarSummary, buildPlannerSummary } from "./operating-system";
import { buildPulseSummary } from "./pulse";

const READ_MODEL_TTLS = {
  calendar: 60,
  planner: 90,
  briefings: 60,
  pulse: 60,
} as const;

export function getCalendarReadModel(force = false) {
  return getReadModel("calendar:v1", READ_MODEL_TTLS.calendar, buildCalendarSummary, { force });
}

export function getPlannerReadModel(force = false) {
  return getReadModel("planner:v1", READ_MODEL_TTLS.planner, buildPlannerSummary, { force });
}

export function getBriefingReadModel(force = false) {
  return getReadModel("briefings:v1", READ_MODEL_TTLS.briefings, buildBriefingSummary, { force });
}

export function getPulseReadModel(force = false) {
  return getReadModel("pulse:v1", READ_MODEL_TTLS.pulse, buildPulseSummary, { force });
}

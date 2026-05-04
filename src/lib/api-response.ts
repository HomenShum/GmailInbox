import { NextResponse } from "next/server";
import type { ReadModelCacheStatus } from "./db";

export function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function timedJson<T>(
  payload: T,
  startedAt: number,
  options: { metric?: string; cacheStatus?: ReadModelCacheStatus | "none" } = {},
) {
  const durationMs = Math.max(0, Math.round((nowMs() - startedAt) * 10) / 10);
  const response = NextResponse.json(payload);
  response.headers.set("Server-Timing", `${options.metric ?? "app"};dur=${durationMs}`);
  response.headers.set("x-response-time-ms", String(durationMs));
  if (options.cacheStatus) response.headers.set("x-read-model-cache", options.cacheStatus);
  return response;
}

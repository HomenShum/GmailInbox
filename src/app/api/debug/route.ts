import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const keys = {
    ANTHROPIC: !!process.env.ANTHROPIC_API_KEY,
    OPENROUTER: !!process.env.OPENROUTER_API_KEY,
    OPENAI: !!process.env.OPENAI_API_KEY,
    GEMINI: !!process.env.GEMINI_API_KEY,
  };
  const sampleEnvKeys = Object.keys(process.env).filter((k) => /API_KEY|TOKEN|SECRET/i.test(k));
  return NextResponse.json({ keys, sampleEnvKeys, NODE_ENV: process.env.NODE_ENV });
}

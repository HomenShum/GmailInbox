import { NextResponse } from "next/server";
import { listConnectedAccounts } from "@/lib/db";
import { hasOAuthCreds } from "@/lib/gmail/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const accounts = listConnectedAccounts();
  return NextResponse.json({
    configured: hasOAuthCreds(),
    connected: accounts.length > 0,
    accounts,
  });
}

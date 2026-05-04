import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const queue = db().prepare(`
    SELECT e.*, c.lane, c.urgency, c.confidence, c.action, c.rationale, c.model AS classifier
    FROM emails e
    JOIN latest_classifications c ON c.email_id = e.id
    WHERE c.lane = 'triage'
      AND COALESCE(e.labels, '') != 'ARCHIVED'
    ORDER BY urgency DESC, e.internal_date DESC
    LIMIT 100
  `).all();

  const lowConfidence = db().prepare(`
    SELECT e.*, c.lane, c.urgency, c.confidence, c.action, c.rationale, c.model AS classifier
    FROM emails e
    JOIN latest_classifications c ON c.email_id = e.id
    WHERE c.confidence < 0.5
      AND COALESCE(e.labels, '') != 'ARCHIVED'
    ORDER BY e.internal_date DESC
    LIMIT 50
  `).all();

  const autoLabeled = db().prepare(`
    SELECT e.*, c.lane, c.urgency, c.confidence, c.model AS classifier
    FROM emails e
    JOIN latest_classifications c ON c.email_id = e.id
    WHERE c.lane != 'triage' AND c.confidence >= 0.7
      AND COALESCE(e.labels, '') != 'ARCHIVED'
    ORDER BY c.confidence DESC
    LIMIT 30
  `).all();

  return NextResponse.json({ queue, lowConfidence, autoLabeled });
}

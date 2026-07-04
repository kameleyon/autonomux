/**
 * apps/web/app/api/voice/stt/route.ts
 *
 * POST multipart { file } (recorded audio blob) → Lemonfox speech-to-text →
 * { text }. Server-side proxy so the LEMONFOX_API_KEY stays private; auth
 * required. The client records with MediaRecorder (works on iOS Safari, unlike
 * the Web Speech API) and posts the blob here.
 */
import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEMONFOX_STT = "https://api.lemonfox.ai/v1/audio/transcriptions";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireAuth(supabase);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const key = process.env["LEMONFOX_API_KEY"];
  if (key === undefined || key.length === 0) {
    return NextResponse.json({ error: "stt_unconfigured" }, { status: 503 });
  }

  let file: Blob | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof Blob) file = f;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (file === null) {
    return NextResponse.json({ error: "no_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }

  const fwd = new FormData();
  fwd.append("file", file, "speech.webm");
  fwd.append("language", "english");
  fwd.append("response_format", "json");

  const res = await fetch(LEMONFOX_STT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: fwd,
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    return NextResponse.json({ error: "stt_failed", detail }, { status: 502 });
  }

  const data = (await res.json().catch(() => ({}))) as { text?: unknown };
  const text = typeof data.text === "string" ? data.text.trim() : "";
  return NextResponse.json({ text }, { headers: { "cache-control": "no-store" } });
}

/**
 * apps/web/app/api/voice/tts/route.ts
 *
 * POST { text } → Lemonfox text-to-speech (voice "adams") → audio/mpeg.
 *
 * Server-side proxy so the LEMONFOX_API_KEY never reaches the browser. Auth is
 * required (signed-in users only) to stop the key being used as an open TTS
 * relay. The client plays the returned mp3.
 */
import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { requireAuth } from "@/lib/auth-helpers";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEMONFOX_TTS = "https://api.lemonfox.ai/v1/audio/speech";
const VOICE = "adam"; // Lemonfox "Adam" voice (verified against the live API)
const MAX_CHARS = 6000; // cost + latency guard

export async function POST(req: NextRequest): Promise<Response> {
  const supabase = await createClient();
  try {
    await requireAuth(supabase);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const key = process.env["LEMONFOX_API_KEY"];
  if (key === undefined || key.length === 0) {
    return NextResponse.json({ error: "tts_unconfigured" }, { status: 503 });
  }

  let text = "";
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text === "string") text = body.text.slice(0, MAX_CHARS).trim();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  if (text.length === 0) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }

  const res = await fetch(LEMONFOX_TTS, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      input: text,
      voice: VOICE,
      response_format: "mp3",
      language: "en-us",
    }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    return NextResponse.json({ error: "tts_failed", detail }, { status: 502 });
  }

  const audio = await res.arrayBuffer();
  return new Response(audio, {
    headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
  });
}

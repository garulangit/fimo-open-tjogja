import { NextResponse, type NextRequest } from "next/server";
import { apiContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// FIMO Agent (v1.2.0): pertanyaan diteruskan ke Bridge self-hosted yang memanggil
// profil Agent + mengeksekusi query read-only. Scope dihitung DI SINI dari
// matriks akses akun (tidak pernah dari klien) dan ditegakkan ulang di
// database lewat SET LOCAL ROLE pada koneksi Bridge.
function scopeFor(ctx: { roles: string[]; moduleAccess: Record<string, { read: boolean }> }): string {
  if (ctx.roles.includes("superadmin")) return "superadmin";
  const b = !!ctx.moduleAccess["branding"]?.read;
  const k = !!ctx.moduleAccess["claim"]?.read;
  if (b && k) return "branding_klaim";
  if (b) return "branding";
  if (k) return "klaim";
  return "none";
}

export async function POST(req: NextRequest) {
  const ctx = await apiContext("agent.use");
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "Pertanyaan kosong." }, { status: 400 });
  if (question.length > 2000)
    return NextResponse.json({ error: "Pertanyaan terlalu panjang (maks 2000 karakter)." }, { status: 400 });

  const history = Array.isArray(body?.history)
    ? body.history
        .filter((h: unknown) => h && typeof h === "object")
        .slice(-6)
        .map((h: { role?: unknown; text?: unknown }) => ({
          role: h.role === "user" ? "user" : "agent",
          text: typeof h.text === "string" ? h.text.slice(0, 800) : "",
        }))
    : [];
  const attachmentText =
    typeof body?.attachment_text === "string" ? body.attachment_text.slice(0, 6000) : undefined;

  const bridgeUrl = process.env.AGENT_BRIDGE_URL;
  const bridgeKey = process.env.AGENT_BRIDGE_KEY;
  if (!bridgeUrl || !bridgeKey)
    return NextResponse.json(
      { error: "Agent belum dikonfigurasi di server." },
      { status: 503 },
    );

  const scope = scopeFor(ctx);
  let res: Response;
  try {
    res = await fetch(`${bridgeUrl}/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-key": bridgeKey },
      body: JSON.stringify({
        question,
        scope,
        user_name: ctx.displayName,
        history,
        attachment_text: attachmentText,
      }),
      signal: AbortSignal.timeout(240_000),
    });
  } catch {
    return NextResponse.json(
      { error: "Agent sedang tidak dapat dihubungi. Coba lagi sebentar lagi." },
      { status: 502 },
    );
  }
  if (!res.ok)
    return NextResponse.json(
      { error: "Agent gagal memproses pertanyaan. Coba lagi." },
      { status: 502 },
    );
  const data = (await res.json()) as {
    answer?: string;
    queries?: string[];
    rows?: Record<string, string | null>[] | null;
  };

  // Audit: pertanyaan + scope + query tercatat (jawaban tidak disimpan).
  try {
    const supabase = await createClient();
    await supabase.rpc("log_audit", {
      p_module: "agent",
      p_action: "agent.ask",
      p_entity_type: "agent_chat",
      p_entity_id: null,
      p_detail: { question, scope, queries: data.queries ?? [] },
    });
  } catch { /* audit gagal tidak menggagalkan jawaban */ }

  return NextResponse.json({ answer: data.answer ?? "", rows: data.rows ?? null });
}

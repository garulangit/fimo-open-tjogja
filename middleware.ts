import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_MAX_AGE_MS } from "@/lib/login-guard";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/auth/expired", "/manifest.webmanifest", "/sw.js"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Tidak terautentikasi" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Umur sesi maksimum 20 jam (login guard, migration 0015): sesi yang
  // lahirnya lebih tua dari batas diakhiri. Pengecekan fail-open — bila
  // waktu lahir sesi tidak terbaca (RPC gagal / sesi sudah dicabut),
  // permintaan diteruskan; sesi yang dicabut gugur sendiri saat refresh.
  // RPC umur sesi dan query profil di bawah independen — diambil paralel
  // dalam satu gelombang (sebelumnya dua round trip berurutan per request).
  const needProfile =
    user && !isPublic && path !== "/change-password" && !path.startsWith("/api/account");
  const [sessionRes, profileRes] =
    user && !isPublic
      ? await Promise.all([
          supabase.rpc("my_session_created_at"),
          needProfile
            ? supabase
                .from("profiles")
                .select("must_change_password, active")
                .eq("id", user.id)
                .single()
            : Promise.resolve({ data: null }),
        ])
      : [{ data: null }, { data: null }];
  const sessionCreatedAt = sessionRes.data;
  if (user && !isPublic) {
    if (
      sessionCreatedAt &&
      Date.now() - new Date(sessionCreatedAt as string).getTime() > SESSION_MAX_AGE_MS
    ) {
      if (path.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Sesi berakhir, silakan masuk kembali" },
          { status: 401 }
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/api/auth/expired";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  if (needProfile) {
    const profile = profileRes.data as { must_change_password: boolean; active: boolean } | null;
    if (profile && !profile.active) {
      if (path.startsWith("/api/")) {
        return NextResponse.json({ error: "Akun nonaktif" }, { status: 403 });
      }
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("error", "nonaktif");
      return NextResponse.redirect(url);
    }
    if (profile?.must_change_password) {
      if (path.startsWith("/api/")) {
        return NextResponse.json(
          { error: "Wajib ganti password terlebih dahulu" },
          { status: 403 }
        );
      }
      const url = request.nextUrl.clone();
      url.pathname = "/change-password";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

import Link from "next/link";
import { Ban, Check, KeyRound, RotateCcw, UserPlus, Users } from "lucide-react";
import { requireContext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const OK: Record<string, string> = {
  dibuat: "Akun baru berhasil dibuat. Akun wajib mengganti password saat pertama masuk.",
  reset: "Password berhasil direset. Akun wajib mengganti password saat masuk berikutnya.",
  aktif: "Status akun berhasil diubah.",
};
const ERR: Record<string, string> = {
  username: "Username tidak valid (3–32 karakter: huruf kecil, angka, garis bawah) atau sudah dipakai.",
  password: "Password minimal 6 karakter.",
  gagal: "Operasi gagal. Coba lagi.",
  terakhir: "Superadmin terakhir tidak dapat dinonaktifkan.",
  diri: "Anda tidak dapat menonaktifkan akun sendiri.",
};

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
  roles: string[];
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await requireContext("platform.users.view");
  const { ok, error } = await searchParams;
  const admin = createAdminClient();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, username, display_name, active, must_change_password, created_at")
    .order("created_at");
  const { data: userRoles } = await admin.from("user_roles").select("user_id, roles(code)");
  const rolesByUser = new Map<string, string[]>();
  (userRoles ?? []).forEach((ur) => {
    const code = (ur.roles as unknown as { code: string } | null)?.code;
    if (!code) return;
    const arr = rolesByUser.get(ur.user_id) ?? [];
    arr.push(code);
    rolesByUser.set(ur.user_id, arr);
  });
  const users: UserRow[] = (profiles ?? []).map((p) => ({
    ...p,
    roles: rolesByUser.get(p.id) ?? [],
  }));
  const canManage = ctx.permissions.includes("platform.users.manage");

  return (
    <>
      <h1 className="section-title"><Users size={24} /> Manajemen User</h1>
      <p className="subtitle">Akun dibuat dan dikelola dari sini — satu pintu, tercatat di audit trail.</p>
      {ok && <div className="alert ok">{OK[ok] ?? "Berhasil."}</div>}
      {error && <div className="alert error">{ERR[error] ?? "Gagal."}</div>}

      <div className="card" style={{ marginBottom: 20 }}>
        <table className="mtable">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Status</th>
              <th>Dibuat</th>
              {canManage && <th>Aksi</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="m-main">
                  <strong>{u.display_name || u.username}</strong>
                  <div className="muted small-text">
                    @{u.username}
                    {u.must_change_password ? " · wajib ganti password" : ""}
                  </div>
                </td>
                <td data-label="Role">
                  <div className="chips" style={{ margin: 0 }}>
                    {u.roles.map((r) => (
                      <span key={r} className="chip">
                        {r}
                      </span>
                    ))}
                  </div>
                </td>
                <td data-label="Status">{u.active ? "Aktif" : "Nonaktif"}</td>
                <td data-label="Dibuat" className="muted">{new Date(u.created_at).toLocaleDateString("id-ID")}</td>
                {canManage && (
                  <td className="m-actions">
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <form
                        className="inline-form"
                        method="post"
                        action={`/api/admin/users/${u.id}`}
                      >
                        <input type="hidden" name="action" value="reset" />
                        <input
                          name="password"
                          type="text"
                          placeholder="Password baru"
                          minLength={6}
                          required
                        />
                        <button className="btn ghost small" type="submit">
                          <RotateCcw size={13} /> Reset
                        </button>
                      </form>
                      <Link className="btn ghost small" href={`/admin/users/${u.id}`}>
                        <KeyRound size={13} /> Akses Modul
                      </Link>
                      <form method="post" action={`/api/admin/users/${u.id}`}>
                        <input type="hidden" name="action" value="active" />
                        <input type="hidden" name="active" value={u.active ? "false" : "true"} />
                        <button className={`btn small ${u.active ? "danger" : "ghost"}`} type="submit">
                          {u.active ? <><Ban size={13} /> Nonaktifkan</> : <><Check size={13} /> Aktifkan</>}
                        </button>
                      </form>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <div className="card">
          <h3 className="section-title" style={{ marginTop: 0 }}><UserPlus size={19} /> Buat akun baru</h3>
          <form method="post" action="/api/admin/users">
            <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
              <div className="field">
                <label htmlFor="username">Username</label>
                <input id="username" name="username" required pattern="[a-z0-9_]{3,32}" />
              </div>
              <div className="field">
                <label htmlFor="display_name">Nama tampil</label>
                <input id="display_name" name="display_name" required />
              </div>
              <div className="field">
                <label htmlFor="role_code">Role</label>
                <select id="role_code" name="role_code" defaultValue="admin">
                  <option value="admin">admin — staf</option>
                  <option value="superadmin">superadmin — root</option>
                  <option value="custom">custom — manual (semua mati)</option>
                </select>
                <p className="muted small-text" style={{ margin: "4px 0 0" }}>
                  Role custom mulai tanpa akses modul apa pun; atur centangnya di Matriks Akses setelah akun dibuat.
                </p>
              </div>
              <div className="field">
                <label htmlFor="password">Password awal</label>
                <input id="password" name="password" type="text" required minLength={6} />
              </div>
            </div>
            <button className="btn primary" type="submit">
              <UserPlus size={15} /> Buat akun
            </button>
            <p className="muted small-text" style={{ marginBottom: 0 }}>
              Akun baru berstatus wajib ganti password pada masuk pertama.
            </p>
          </form>
        </div>
      )}
    </>
  );
}

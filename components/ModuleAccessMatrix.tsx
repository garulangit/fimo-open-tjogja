"use client";

import { useMemo, useState } from "react";
import { KeyRound } from "lucide-react";
import { MODULE_NAMES } from "./NavLinks";
import {
  GRANT_FEATURES,
  MODULE_FEATURES,
  MODULE_PERMISSION_CODES,
  type FeatureAccess,
  type ModuleAccess,
  type ModuleGrant,
} from "@/lib/module-access";

export interface MatrixModuleRow {
  code: string;
  name: string;
  status: string;
}

const EXTRA_NAMES: Record<string, string> = {
  workspace: "Workspace",
  agent: "AI Agent",
};

const DESCRIPTIONS: Record<string, string> = {
  branding: "Penjadwalan branding bus, pricelist, dan kelengkapan administrasi.",
  claim: "Pengajuan & verifikasi klaim subsidi operasional.",
  spm: "Impor temuan Dishub, rekonsiliasi, dan penetapan denda SPM.",
  photo_stamp: "Dokumentasi foto lapangan dengan stempel tanggal, waktu, dan lokasi.",
  workspace: "Application Hub & Work Drive.",
  agent: "Boleh memakai AI Agent (read-only fisik di database).",
};

/** Modul yang kolom Write-nya bermakna (punya kode permission tulis). */
function writeEnabled(code: string): boolean {
  return code === "spm" || (MODULE_PERMISSION_CODES[code]?.write.length ?? 0) > 0;
}

const ADMIN_PRESET: ModuleAccess = {
  branding: { read: true, write: true },
  claim: { read: true, write: true },
  spm: { read: false, write: false },
  photo_stamp: { read: false, write: false },
  workspace: { read: false, write: false },
  agent: { read: false, write: false },
};

function Switch({
  name,
  checked,
  disabled,
  onChange,
  label,
}: {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className={`mx-switch ${disabled ? "is-off" : ""}`} title={label}>
      <input
        type="checkbox"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="mx-track"><span className="mx-knob" /></span>
      <span className="mx-switch-label">{label}</span>
    </label>
  );
}

export default function ModuleAccessMatrix({
  userId,
  modules,
  initial,
  initialFeatures,
  canManage,
}: {
  userId: string;
  modules: MatrixModuleRow[];
  initial: ModuleAccess;
  initialFeatures: FeatureAccess;
  canManage: boolean;
}) {
  const [grants, setGrants] = useState<ModuleAccess>(initial);
  // Intent fitur: untuk modul yang sedang Read, mulai dari keadaan tersimpan;
  // modul yang mati mulai dari "semua boleh" (keadaan waris bawaan).
  const [features, setFeatures] = useState<Record<string, boolean>>(() => {
    const out: Record<string, boolean> = {};
    for (const [module, feats] of Object.entries(MODULE_FEATURES)) {
      for (const f of feats) {
        // Fitur GRANT (opt-in, mis. Override Total) bawaannya selalu MATI —
        // tidak pernah menyala hanya karena preset/modul dinyalakan.
        out[f.code] = GRANT_FEATURES.has(f.code)
          ? Boolean(initial[module]?.read && initialFeatures[f.code])
          : initial[module]?.read
            ? (initialFeatures[f.code] ?? true)
            : true;
      }
    }
    return out;
  });

  const allPreset = useMemo<ModuleAccess>(() => {
    const out: ModuleAccess = {};
    for (const m of modules) {
      const off = m.status === "unavailable";
      out[m.code] = { read: !off, write: !off && writeEnabled(m.code) };
    }
    return out;
  }, [modules]);

  const presetName = useMemo(() => {
    const norm = (a: ModuleAccess) =>
      modules.map((m) => {
        const g = a[m.code] ?? { read: false, write: false };
        return `${m.code}:${g.read ? 1 : 0}${g.write ? 1 : 0}`;
      }).join("|");
    if (norm(grants) === norm(ADMIN_PRESET)) return "Preset: Admin";
    if (norm(grants) === norm(allPreset)) return "Preset: Semua modul";
    if (modules.every((m) => !grants[m.code]?.read && !grants[m.code]?.write)) return "Preset: Kosong";
    return "Kustom";
  }, [grants, modules, allPreset]);

  const setGrant = (code: string, patch: Partial<ModuleGrant>) => {
    setGrants((prev) => {
      const next = { ...prev, [code]: { ...(prev[code] ?? { read: false, write: false }), ...patch } };
      if (next[code].write) next[code].read = true; // Write => Read
      if (!next[code].read) next[code].write = false;
      return next;
    });
  };

  const setAllFeatures = (v: boolean) =>
    setFeatures((prev) =>
      Object.fromEntries(
        Object.entries(prev).map(([k, cur]) => [k, v && GRANT_FEATURES.has(k) ? cur : v]),
      ),
    );

  return (
    <form method="post" action={`/api/admin/users/${userId}/module-access`}>
      <div className="mx-toolbar">
        <span className="chip"><KeyRound size={13} /> {presetName}</span>
        {canManage && (
          <>
            <button type="button" className="btn ghost small" onClick={() => { setGrants(ADMIN_PRESET); setAllFeatures(true); }}>
              Terapkan preset Admin
            </button>
            <button type="button" className="btn ghost small" onClick={() => { setGrants(allPreset); setAllFeatures(true); }}>
              Semua modul
            </button>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setGrants(Object.fromEntries(modules.map((m) => [m.code, { read: false, write: false }])))}
            >
              Kosongkan
            </button>
          </>
        )}
      </div>

      <p className="muted small-text" style={{ margin: "0 0 14px" }}>
        Modul yang Read-nya mati tidak tampil sama sekali di akun ini. Submenu yang dimatikan ikut
        hilang dari navigasi, dan izin API yang terpetakan ke submenu itu ikut dicabut.
        Khusus <strong>Override Total (Nego)</strong>: izin istimewa yang bawaannya mati dan tidak
        pernah menyala otomatis oleh preset — centang manual bila akun ini boleh mengubah total transaksi hasil nego.
      </p>

      <div className="mx-grid">
        {modules.map((m) => {
          const g = grants[m.code] ?? { read: false, write: false };
          const unavailable = m.status === "unavailable";
          const name = MODULE_NAMES[m.code] ?? EXTRA_NAMES[m.code] ?? m.name;
          const feats = MODULE_FEATURES[m.code] ?? [];
          return (
            <section key={m.code} className={`mx-card ${g.read ? "is-on" : ""} ${unavailable ? "is-unavailable" : ""}`}>
              <header className="mx-head">
                <div>
                  <strong>{name}</strong>
                  <p className="mx-desc">{DESCRIPTIONS[m.code] ?? ""}</p>
                  {unavailable && <p className="mx-desc">Belum tersedia — belum bisa dicentang.</p>}
                  {m.status === "preview" && <p className="mx-desc">Pratinjau — modul tampil, data belum tersimpan permanen.</p>}
                </div>
                <span className={`tag ${g.read ? "on" : ""}`}>{g.read ? "Tampil" : "Tersembunyi"}</span>
              </header>

              <div className="mx-toggles">
                <Switch
                  name={`read_${m.code}`}
                  label="Read"
                  checked={g.read}
                  disabled={!canManage || unavailable}
                  onChange={(v) => setGrant(m.code, { read: v })}
                />
                {writeEnabled(m.code) ? (
                  <Switch
                    name={`write_${m.code}`}
                    label="Write"
                    checked={g.write}
                    disabled={!canManage || unavailable || !g.read}
                    onChange={(v) => setGrant(m.code, { write: v })}
                  />
                ) : (
                  <span className="mx-readonly-note">Read saja</span>
                )}
              </div>

              {feats.length > 0 && (
                <div className={`mx-features ${g.read ? "" : "is-dim"}`}>
                  <div className="mx-features-title">Submenu</div>
                  {feats.map((f) => (
                    <div key={f.code} className={`mx-feature ${f.sub ? "mx-feature--sub" : ""}`}>
                      <Switch
                        name={`feat_${f.code}`}
                        label={f.label}
                        checked={features[f.code] ?? true}
                        disabled={!canManage || unavailable || !g.read}
                        onChange={(v) => setFeatures((prev) => ({ ...prev, [f.code]: v }))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {canManage && (
        <div className="mx-savebar">
          <span className="muted small-text">Perubahan berlaku pada login/muat ulang berikutnya.</span>
          <button type="submit" className="btn primary">Simpan akses modul</button>
        </div>
      )}
    </form>
  );
}

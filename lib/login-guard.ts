/** Login guard (migration 0015) — konstanta bersama route login & middleware. */

/** Kegagalan login maksimum per username dalam jendela sebelum ditolak sementara. */
export const LOGIN_MAX_FAILURES = 10;
/**
 * Batas per IP dibuat jauh lebih longgar: satu kantor berada di balik NAT
 * yang sama, jadi ambang IP yang ketat bisa mengunci satu kantor gara-gara
 * satu orang. Ambang ini hanya menahan penyemprotan lintas akun.
 */
export const LOGIN_MAX_FAILURES_IP = 50;
/** Jendela hitung kegagalan (menit), dihitung sejak login sukses terakhir. */
export const LOGIN_WINDOW_MINUTES = 15;
/** Sesi aktif maksimum per akun; login baru mencabut sesi tertua di luar ini. */
export const MAX_SESSIONS_PER_USER = 9;
/** Umur sesi maksimum: 20 jam sejak login, ditegakkan middleware. */
export const SESSION_MAX_AGE_MS = 20 * 60 * 60 * 1000;

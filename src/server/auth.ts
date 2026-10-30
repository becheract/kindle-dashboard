import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { DB } from "./db.ts";

const SESSION_DAYS = 30;

export interface User {
  id: number;
  email: string;
  sync_key: string;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

export const newToken = () => randomBytes(32).toString("base64url");

export function createUser(db: DB, email: string, password: string): User {
  const syncKey = newToken();
  const row = db
    .prepare("INSERT INTO users (email, password_hash, sync_key) VALUES (?, ?, ?) RETURNING id, email, sync_key")
    .get(email.trim(), hashPassword(password), syncKey) as unknown as User;
  return row;
}

export function findUserByLogin(db: DB, email: string, password: string): User | undefined {
  const row = db.prepare("SELECT id, email, sync_key, password_hash FROM users WHERE email = ?").get(email.trim()) as
    | (User & { password_hash: string })
    | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return undefined;
  return { id: row.id, email: row.email, sync_key: row.sync_key };
}

export function findUserBySyncKey(db: DB, key: string): User | undefined {
  return db.prepare("SELECT id, email, sync_key FROM users WHERE sync_key = ?").get(key) as User | undefined;
}

export function rotateSyncKey(db: DB, userId: number): string {
  const key = newToken();
  db.prepare("UPDATE users SET sync_key = ? WHERE id = ?").run(key, userId);
  return key;
}

export function createSession(db: DB, userId: number): string {
  const token = newToken();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    Date.now() + SESSION_DAYS * 86400_000,
  );
  return token;
}

export function userForSession(db: DB, token: string | undefined): User | undefined {
  if (!token) return undefined;
  return db
    .prepare(
      `SELECT u.id, u.email, u.sync_key FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, Date.now()) as User | undefined;
}

export function deleteSession(db: DB, token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}

export const SESSION_MAX_AGE = SESSION_DAYS * 86400;

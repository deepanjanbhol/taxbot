/**
 * keychain.ts
 *
 * Local credential encryption using AES-256-GCM.
 * No external dependencies — uses Node's built-in `crypto` module.
 *
 * How it works:
 *   1. On first use, generates a random 256-bit key and writes it to
 *      ~/.config/taxbot/.key  (mode 0o600 on Unix)
 *   2. Sensitive config fields are stored as  enc:v1:<iv>:<tag>:<ciphertext>
 *   3. loadConfig/saveConfig transparently decrypt/encrypt those fields
 *
 * Sensitive fields encrypted: anthropicApiKey, twilioAuthToken, telegramBotToken
 */

import crypto from "crypto";
import fs     from "fs/promises";
import path   from "path";
import os     from "os";
import type { TaxBotConfig } from "../dashboard/src/types/pipeline.js";

const KEY_PATH  = path.join(os.homedir(), ".config", "taxbot", ".key");
const ALGORITHM = "aes-256-gcm" as const;
const PREFIX    = "enc:v1:";

const SENSITIVE: ReadonlyArray<keyof TaxBotConfig> = [
  "anthropicApiKey",
  "twilioAuthToken",
  "telegramBotToken",
];

// ── Key management ────────────────────────────────────────────────────────────

let _keyCache: Buffer | null = null;

async function getKey(): Promise<Buffer> {
  if (_keyCache) return _keyCache;
  try {
    _keyCache = await fs.readFile(KEY_PATH);
    if (_keyCache.length !== 32) throw new Error("bad key length");
    return _keyCache;
  } catch {
    const key = crypto.randomBytes(32);
    await fs.mkdir(path.dirname(KEY_PATH), { recursive: true });
    await fs.writeFile(KEY_PATH, key, { mode: 0o600 });
    _keyCache = key;
    console.log("[TaxBot Keychain] New encryption key generated at", KEY_PATH);
    return _keyCache;
  }
}

// ── Field-level encryption ────────────────────────────────────────────────────

export function isEncrypted(value: string | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export async function encryptField(plaintext: string): Promise<string> {
  const key    = await getKey();
  const iv     = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const enc    = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

export async function decryptField(value: string): Promise<string> {
  if (!isEncrypted(value)) return value;
  const parts = value.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return value; // malformed — return as-is
  const [ivHex, tagHex, encHex] = parts as [string, string, string];
  const key      = await getKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, "hex")),
    decipher.final(),
  ]).toString("utf-8");
}

// ── Config helpers ─────────────────────────────────────────────────────────────

/** Encrypt sensitive fields before writing to disk. */
export async function encryptConfig(config: TaxBotConfig): Promise<TaxBotConfig> {
  const out = { ...config } as Record<string, unknown>;
  for (const field of SENSITIVE) {
    const val = config[field];
    if (val && typeof val === "string" && !isEncrypted(val)) {
      out[field] = await encryptField(val);
    }
  }
  return out as TaxBotConfig;
}

/** Decrypt sensitive fields after reading from disk. */
export async function decryptConfig(config: TaxBotConfig): Promise<TaxBotConfig> {
  const out = { ...config } as Record<string, unknown>;
  for (const field of SENSITIVE) {
    const val = config[field];
    if (val && typeof val === "string" && isEncrypted(val)) {
      try {
        out[field] = await decryptField(val);
      } catch {
        console.warn(`[TaxBot Keychain] Failed to decrypt field "${field}" — leaving masked`);
        out[field] = ""; // don't expose garbled ciphertext
      }
    }
  }
  return out as TaxBotConfig;
}

/** Returns true if the config on disk already has all sensitive fields encrypted. */
export function configIsEncrypted(config: TaxBotConfig): boolean {
  return SENSITIVE.some(f => isEncrypted(config[f] as string | undefined));
}

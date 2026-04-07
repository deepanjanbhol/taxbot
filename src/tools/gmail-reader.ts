/**
 * gmail-reader.ts
 * OAuth2 Gmail integration — fetches tax-related emails and attachments.
 *
 * Setup (one-time):
 *   1. Go to console.cloud.google.com → New Project → Enable Gmail API
 *   2. Create OAuth2 credentials (Desktop app) → download credentials.json
 *   3. Set GMAIL_CREDENTIALS_PATH in .env
 *   4. First run will open a browser for authorization → token saved to GMAIL_TOKEN_PATH
 */

import fs from "fs/promises";
import path from "path";
import os from "os";
import { google } from "googleapis";
import type { Auth } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];

const DEFAULT_CREDENTIALS_PATH = path.join(os.homedir(), ".config", "taxbot", "gmail_credentials.json");
const DEFAULT_TOKEN_PATH       = path.join(os.homedir(), ".config", "taxbot", "gmail_token.json");

export interface GmailTaxEmail {
  id: string;
  date: string;
  from: string;
  subject: string;
  bodyText: string;
  attachmentNames: string[];
}

/** Load or refresh OAuth2 client. Throws if credentials not set up. */
async function getAuthClient(
  credentialsPath: string,
  tokenPath: string
): Promise<Auth.OAuth2Client> {
  let credsRaw: string;
  try {
    credsRaw = await fs.readFile(credentialsPath, "utf-8");
  } catch {
    throw new Error(
      `Gmail credentials not found at ${credentialsPath}.\n` +
      `Download credentials.json from Google Cloud Console and set GMAIL_CREDENTIALS_PATH.`
    );
  }

  const creds = JSON.parse(credsRaw);
  const { client_id, client_secret, redirect_uris } = creds.installed ?? creds.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  // Try to load cached token
  try {
    const tokenRaw = await fs.readFile(tokenPath, "utf-8");
    oAuth2Client.setCredentials(JSON.parse(tokenRaw));

    // Refresh if expired
    const tokenInfo = oAuth2Client.credentials;
    if (tokenInfo.expiry_date && tokenInfo.expiry_date < Date.now()) {
      const { credentials } = await oAuth2Client.refreshAccessToken();
      oAuth2Client.setCredentials(credentials);
      await fs.mkdir(path.dirname(tokenPath), { recursive: true });
      await fs.writeFile(tokenPath, JSON.stringify(credentials));
    }
    return oAuth2Client;
  } catch {
    // Token not found — generate auth URL and instruct user
    const authUrl = oAuth2Client.generateAuthUrl({ access_type: "offline", scope: SCOPES });
    throw new Error(
      `Gmail not authorized yet.\n\n` +
      `1. Open this URL in your browser:\n${authUrl}\n\n` +
      `2. After authorizing, you'll get a code.\n` +
      `3. Run: tax_gmail_authorize <code>\n\n` +
      `This only needs to be done once.`
    );
  }
}

/** Exchange an auth code for a token and save it (called once during setup). */
export async function authorizeGmail(
  code: string,
  credentialsPath = DEFAULT_CREDENTIALS_PATH,
  tokenPath = DEFAULT_TOKEN_PATH
): Promise<string> {
  const credsRaw = await fs.readFile(credentialsPath, "utf-8");
  const creds = JSON.parse(credsRaw);
  const { client_id, client_secret, redirect_uris } = creds.installed ?? creds.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  const { tokens } = await oAuth2Client.getToken(code);
  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(tokens));
  return `Gmail authorized successfully. Token saved to ${tokenPath}.`;
}

/** Decode base64url encoded Gmail body. */
function decodeBody(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

/** Recursively extract plain-text body and attachment names from message parts. */
function extractParts(
  parts: Array<{ mimeType?: string; body?: { data?: string }; filename?: string; parts?: unknown[] }>,
  result: { text: string; attachments: string[] }
): void {
  for (const part of parts) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      result.text += decodeBody(part.body.data) + "\n";
    } else if (part.filename && part.filename.length > 0) {
      result.attachments.push(part.filename);
    }
    if (part.parts) {
      extractParts(part.parts as typeof parts, result);
    }
  }
}

/** Build tax-related Gmail search queries for a given tax year.
 *  Searches for documents sent DURING the tax year OR during filing season
 *  (Jan 1 – Apr 15 of the following year, when issuers send tax forms). */
function buildTaxQueries(taxYear: number): string[] {
  // Forms are issued Jan–Feb of the year AFTER the tax year
  const after  = `${taxYear}/01/01`;   // start of tax year
  const before = `${taxYear + 1}/04/16`; // end of filing season
  return [
    `subject:(W-2 OR W2) after:${after} before:${before}`,
    `subject:(1099) after:${after} before:${before}`,
    `subject:(1098) after:${after} before:${before}`,
    `subject:(tax document OR tax form OR tax statement) after:${after} before:${before}`,
    `subject:(K-1 OR schedule K) after:${after} before:${before}`,
    `from:(irs.gov) after:${after} before:${before}`,
    `subject:(social security statement) after:${after} before:${before}`,
  ];
}

/** Fetch tax-related emails from Gmail. */
export async function fetchTaxEmails(
  credentialsPath = DEFAULT_CREDENTIALS_PATH,
  tokenPath = DEFAULT_TOKEN_PATH,
  maxPerQuery = 5,
  taxYear = new Date().getFullYear() - 1
): Promise<{ emails: GmailTaxEmail[]; errors: string[]; summary: string }> {
  const errors: string[] = [];
  const emails: GmailTaxEmail[] = [];
  const seenIds = new Set<string>();

  let auth: Auth.OAuth2Client;
  try {
    auth = await getAuthClient(credentialsPath, tokenPath);
  } catch (err) {
    return {
      emails: [],
      errors: [err instanceof Error ? err.message : String(err)],
      summary: "Gmail auth failed.",
    };
  }

  const gmail = google.gmail({ version: "v1", auth });

  for (const query of buildTaxQueries(taxYear)) {
    try {
      const listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults: maxPerQuery,
      });

      const messages = listRes.data.messages ?? [];

      for (const msgRef of messages) {
        if (!msgRef.id || seenIds.has(msgRef.id)) continue;
        seenIds.add(msgRef.id);

        try {
          const msgRes = await gmail.users.messages.get({
            userId: "me",
            id: msgRef.id,
            format: "full",
          });

          const msg = msgRes.data;
          const headers = msg.payload?.headers ?? [];

          const getHeader = (name: string) =>
            headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

          const parts = msg.payload?.parts ?? [];
          const bodyResult = { text: "", attachments: [] as string[] };

          // Handle single-part messages
          if (parts.length === 0 && msg.payload?.body?.data) {
            bodyResult.text = decodeBody(msg.payload.body.data);
          } else {
            extractParts(parts, bodyResult);
          }

          // Truncate large email bodies
          const bodyText = bodyResult.text.length > 5000
            ? bodyResult.text.slice(0, 5000) + "\n[...truncated]"
            : bodyResult.text;

          emails.push({
            id: msgRef.id,
            date: getHeader("Date"),
            from: getHeader("From"),
            subject: getHeader("Subject"),
            bodyText,
            attachmentNames: bodyResult.attachments,
          });
        } catch (msgErr) {
          errors.push(`Message ${msgRef.id}: ${msgErr instanceof Error ? msgErr.message : String(msgErr)}`);
        }
      }
    } catch (queryErr) {
      errors.push(`Query "${query}": ${queryErr instanceof Error ? queryErr.message : String(queryErr)}`);
    }
  }

  const summary = `Gmail scan complete. Found ${emails.length} tax-related emails across ${TAX_QUERIES.length} search queries.${errors.length ? ` ${errors.length} errors.` : ""}`;
  return { emails, errors, summary };
}

/**
 * sms-sender.ts
 * Sends the tax report + CPA list via Twilio SMS.
 * Handles Twilio's 1600-char per-message limit by splitting into segments.
 */

import twilio from "twilio";

export interface SmsConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;   // E.164 format: +12025551234
  toNumber: string;     // E.164 format
}

export interface SmsResult {
  success: boolean;
  segmentsSent: number;
  messageIds: string[];
  error?: string;
}

const MAX_SMS_CHARS = 1550; // Leave ~50 chars buffer below 1600

/** Split a long string into SMS segments. */
function splitIntoSegments(text: string, maxLength = MAX_SMS_CHARS): string[] {
  if (text.length <= maxLength) return [text];

  const segments: string[] = [];
  const lines = text.split("\n");
  let current = "";

  for (const line of lines) {
    const candidate = current ? current + "\n" + line : line;

    if (candidate.length > maxLength) {
      if (current) {
        segments.push(current);
        current = line;
      } else {
        // Single line exceeds limit — hard split
        let remaining = line;
        while (remaining.length > maxLength) {
          segments.push(remaining.slice(0, maxLength));
          remaining = remaining.slice(maxLength);
        }
        current = remaining;
      }
    } else {
      current = candidate;
    }
  }

  if (current) segments.push(current);

  // Add segment indicators if multiple
  if (segments.length > 1) {
    return segments.map((seg, i) => `[${i + 1}/${segments.length}]\n${seg}`);
  }

  return segments;
}

/** Send a single SMS message via Twilio. */
async function sendSingleSms(
  client: ReturnType<typeof twilio>,
  from: string,
  to: string,
  body: string
): Promise<string> {
  const message = await client.messages.create({ from, to, body });
  return message.sid;
}

/** Send a (potentially long) report as multiple SMS messages. */
export async function sendTaxReport(
  config: SmsConfig,
  fullReport: string
): Promise<SmsResult> {
  const client = twilio(config.accountSid, config.authToken);
  const segments = splitIntoSegments(fullReport);
  const messageIds: string[] = [];

  try {
    for (let i = 0; i < segments.length; i++) {
      // Small delay between segments to ensure in-order delivery
      if (i > 0) await new Promise(r => setTimeout(r, 300));

      const sid = await sendSingleSms(client, config.fromNumber, config.toNumber, segments[i]!);
      messageIds.push(sid);
    }

    return {
      success: true,
      segmentsSent: segments.length,
      messageIds,
    };
  } catch (err) {
    return {
      success: false,
      segmentsSent: messageIds.length,
      messageIds,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Validate E.164 phone number format. */
export function validateE164(phone: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(phone);
}

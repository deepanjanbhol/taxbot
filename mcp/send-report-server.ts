/**
 * MCP Server: send-report
 * Tools:
 *   send_tax_report(sms_text, twilio_config, recipient_phone)
 *   save_report_snapshot(content)  — fallback when Twilio not configured
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { sendTaxReport } from "../src/tools/sms-sender.js";
import { sendTelegramReport } from "../src/tools/telegram-sender.js";
import fs from "fs/promises";
import path from "path";
import os from "os";

const server = new Server(
  { name: "send-report", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "send_tax_report",
      description:
        "Send the tax summary report via Twilio SMS. " +
        "Automatically splits messages longer than 1550 characters into segments. " +
        "Returns message IDs on success.",
      inputSchema: {
        type: "object",
        properties: {
          sms_text: {
            type: "string",
            description: "The full SMS content to send.",
          },
          account_sid:   { type: "string", description: "Twilio Account SID." },
          auth_token:    { type: "string", description: "Twilio Auth Token." },
          from_number:   { type: "string", description: "Twilio sender phone number." },
          to_number:     { type: "string", description: "Recipient phone number." },
        },
        required: ["sms_text", "account_sid", "auth_token", "from_number", "to_number"],
      },
    },
    {
      name: "send_telegram_report",
      description:
        "Send the tax summary report via Telegram Bot API. " +
        "Use this when Twilio is not configured but a Telegram bot token and chat ID are available. " +
        "Reports over 12,000 characters are automatically sent as a .txt file attachment.",
      inputSchema: {
        type: "object",
        properties: {
          report_text: { type: "string", description: "The full report content to send." },
          bot_token:   { type: "string", description: "Telegram Bot API token from @BotFather." },
          chat_id:     { type: "string", description: "Telegram chat ID (numeric) or @channelusername." },
        },
        required: ["report_text", "bot_token", "chat_id"],
      },
    },
    {
      name: "save_report_snapshot",
      description:
        "Save the tax summary to a local file when SMS is not configured. " +
        "Returns the absolute path to the saved snapshot file.",
      inputSchema: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "The full report content to save.",
          },
        },
        required: ["content"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name === "send_tax_report") {
    const { sms_text, account_sid, auth_token, from_number, to_number } = req.params.arguments as {
      sms_text: string;
      account_sid: string;
      auth_token: string;
      from_number: string;
      to_number: string;
    };

    const result = await sendTaxReport(
      { accountSid: account_sid, authToken: auth_token, fromNumber: from_number, toNumber: to_number },
      sms_text
    );

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          attempted:    true,
          sent:         result.success,
          twilioMissing: false,
          success:      result.success,
          segmentsSent: result.segmentsSent,
          messageIds:   result.messageIds,
          error:        result.error,
          smsText:      sms_text,
          segments:     Math.ceil(sms_text.length / 1550),
          charCount:    sms_text.length,
        }),
      }],
    };
  }

  if (req.params.name === "send_telegram_report") {
    const { report_text, bot_token, chat_id } = req.params.arguments as {
      report_text: string; bot_token: string; chat_id: string;
    };
    const result = await sendTelegramReport({ botToken: bot_token, chatId: chat_id }, report_text);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          attempted:    true,
          sent:         result.success,
          success:      result.success,
          messagesSent: result.messagesSent,
          error:        result.error,
          charCount:    report_text.length,
        }),
      }],
    };
  }

  if (req.params.name === "save_report_snapshot") {
    const { content } = req.params.arguments as { content: string };

    const snapshotDir  = path.join(os.homedir(), ".config", "taxbot", "snapshots");
    const snapshotFile = path.join(snapshotDir, `sms-snapshot-${Date.now()}.txt`);
    await fs.mkdir(snapshotDir, { recursive: true });
    await fs.writeFile(snapshotFile, content, "utf-8");

    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          attempted:    true,
          sent:         false,
          twilioMissing: true,
          snapshotFile,
          smsText:      content,
          segments:     Math.ceil(content.length / 1550),
          charCount:    content.length,
          setupAction:  "Go to Setup → Twilio SMS tab to add credentials and auto-send next time.",
          note:         "Your SMS report is ready — copy it or configure Twilio to auto-send.",
        }),
      }],
    };
  }

  throw new Error(`Unknown tool: ${req.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * MCP Server: extract-income
 * Tool: extract_income_fields(documents, tax_year)
 * Uses Claude haiku as a sub-agent to read raw document text and call
 * record_tax_field for every dollar value it finds.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { extractTaxDataWithAI } from "../src/tools/ai-extractor.js";

const server = new Server(
  { name: "extract-income", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "extract_income_fields",
      description:
        "Use Claude AI to intelligently extract all tax field values from raw document text. " +
        "Handles any PDF layout (W-2 concatenated numbers, 1099-DIV dot-leaders, Chase summary format, etc.). " +
        "Returns structured TaxInputData with an extraction log showing exactly which field " +
        "came from which document and box label.",
      inputSchema: {
        type: "object",
        properties: {
          documents: {
            type: "array",
            description: "Array of document objects from scan_tax_documents.",
            items: {
              type: "object",
              properties: {
                filename: { type: "string" },
                type:     { type: "string" },
                content:  { type: "string" },
              },
              required: ["filename", "type", "content"],
            },
          },
          tax_year: {
            type: "number",
            description: "Tax year to extract for (e.g. 2025).",
          },
          api_key: {
            type: "string",
            description: "Anthropic API key. Falls back to ANTHROPIC_API_KEY env var.",
          },
        },
        required: ["documents", "tax_year"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== "extract_income_fields") {
    throw new Error(`Unknown tool: ${req.params.name}`);
  }

  const { documents, tax_year, api_key } = req.params.arguments as {
    documents: Array<{ filename: string; type: string; content: string }>;
    tax_year: number;
    api_key?: string;
  };

  const apiKey = api_key || process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          error: "ANTHROPIC_API_KEY not set. Cannot perform AI extraction.",
          taxInput: null,
          extractionLog: [],
          warnings: ["Set ANTHROPIC_API_KEY environment variable or pass api_key parameter."],
        }),
      }],
      isError: true,
    };
  }

  const progressLog: string[] = [];
  const result = await extractTaxDataWithAI(
    documents,
    tax_year,
    apiKey,
    (msg) => progressLog.push(msg)
  );

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        taxInput:      result.taxInput,
        extractionLog: result.extractionLog,
        warnings:      result.warnings,
        tokensUsed:    result.tokensUsed,
        progressLog,
      }),
    }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);

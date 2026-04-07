/**
 * MCP Server: scan-documents
 * Tool: scan_tax_documents(folder_path)
 * Scans a local folder for tax PDFs, extracts text, classifies doc types.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { crawlTaxDocuments } from "../src/tools/file-crawler.js";

const server = new Server(
  { name: "scan-documents", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "scan_tax_documents",
      description:
        "Recursively scan a local folder for tax documents (W-2, 1099-*, 1098, etc.). " +
        "Extracts text from PDFs and classifies each file by form type. " +
        "Returns structured document list with raw text content for downstream extraction.",
      inputSchema: {
        type: "object",
        properties: {
          folder_path: {
            type: "string",
            description: "Absolute path to the folder containing tax documents.",
          },
          max_files: {
            type: "number",
            description: "Maximum number of files to process (default 50).",
          },
        },
        required: ["folder_path"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== "scan_tax_documents") {
    throw new Error(`Unknown tool: ${req.params.name}`);
  }

  const { folder_path, max_files = 50 } = req.params.arguments as {
    folder_path: string;
    max_files?: number;
  };

  const result = await crawlTaxDocuments(folder_path, max_files);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          documents: result.documents.map((d) => ({
            filename:     d.filename,
            filePath:     d.filePath,
            type:         d.type,
            sizeBytes:    d.sizeBytes,
            mimeType:     d.mimeType,
            hasError:     d.content.includes("[PDF parse error"),
            isImageBased: d.content.includes("[PDF parse error"),
            preview:      d.content.slice(0, 600),
            // Full content for extraction — needed by extract-income server
            content:      d.content,
          })),
          summary:  result.summary,
          errors:   result.errors,
          docCount: result.documents.length,
        }),
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);

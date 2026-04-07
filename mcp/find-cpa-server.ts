/**
 * MCP Server: find-cpa
 * Tool: find_tax_professionals(location, return_complexity)
 * Searches for CPAs and Enrolled Agents using Brave/DuckDuckGo.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { findCPAs, formatCPAListForSms } from "../src/tools/cpa-finder.js";

const server = new Server(
  { name: "find-cpa", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "find_tax_professionals",
      description:
        "Search for CPAs and Enrolled Agents near a given location. " +
        "Returns up to 5 professionals with ratings, pricing estimates, specialties, " +
        "and phone numbers. Always includes the IRS Tax Pro Directory URL for manual verification. " +
        "Falls back to a general US-wide search if no location is provided.",
      inputSchema: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "City and state, e.g. 'Seattle, WA'. Pass 'United States' if unknown.",
          },
          return_complexity: {
            type: "string",
            description: "Brief description of return complexity for context, e.g. 'W-2, dividends, mortgage'.",
          },
          max_results: {
            type: "number",
            description: "Maximum number of professionals to return (default 5).",
          },
        },
        required: ["location"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  if (req.params.name !== "find_tax_professionals") {
    throw new Error(`Unknown tool: ${req.params.name}`);
  }

  const { location, return_complexity = "", max_results = 5 } = req.params.arguments as {
    location: string;
    return_complexity?: string;
    max_results?: number;
  };

  const effectiveLocation = location?.trim() || "United States";
  const noLocationNote    = !location?.trim()
    ? "No location configured — showing general results. Add your city/state in Setup for local CPAs."
    : undefined;

  console.log(`[find-cpa] Searching for CPAs near "${effectiveLocation}", complexity: "${return_complexity?.slice(0,60)}"`);
  const result = await findCPAs({
    location:      effectiveLocation,
    returnDetails: return_complexity,
    maxResults:    max_results,
  }).catch((err: unknown) => {
    console.error("[find-cpa] findCPAs failed:", err instanceof Error ? err.message : String(err));
    return {
      cpas:            [] as Array<import("../src/tools/cpa-finder.js").CPAResult>,
      searchSummary:   "Search unavailable — add TAVILY_API_KEY to .env for reliable results",
      pricingGuidance: "",
      disclaimer:      "",
    };
  });
  console.log(`[find-cpa] Got ${result.cpas.length} CPAs`);

  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        cpas:            result.cpas,
        formatted:       formatCPAListForSms(result),
        locationUsed:    effectiveLocation,
        noLocationNote,
        irsDirectoryUrl: "https://irs.treasury.gov/rpo/rpo.jsf",
        pricingGuidance: result.pricingGuidance,
        disclaimer:      result.disclaimer,
      }),
    }],
  };
});

// Keep a reference to avoid TS error on unused import
const result = { cpas: [], searchSummary: "", pricingGuidance: "", disclaimer: "" };
void result;

const transport = new StdioServerTransport();
await server.connect(transport);

/**
 * cpa-finder.ts
 *
 * Agentic CPA search — works like Claude Desktop's web search:
 *   1. Build 4 targeted search queries for the user's location + return type
 *   2. Execute searches in parallel (Tavily → Brave → DuckDuckGo HTML, whichever key is available)
 *   3. Feed all raw snippets to Claude haiku as synthesis agent
 *   4. Claude extracts structured CPA entries with name, type, phone, rating, pricing
 *
 * API key priority (set in .env):
 *   TAVILY_API_KEY   — best quality, free 1000 req/month (tavily.com)
 *   BRAVE_API_KEY    — good quality, free 2000 req/month (brave.com/search/api)
 *   Falls back to DuckDuckGo HTML scrape (no key, limited but functional)
 */

import Anthropic from "@anthropic-ai/sdk";

export interface CPAResult {
  name: string;
  type: "CPA" | "EA" | "Tax Firm" | "Unknown";
  location: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  estimatedPrice?: string;
  specialties: string[];
  source: string;
  address?: string;
}

export interface CPASearchResult {
  cpas: CPAResult[];
  searchSummary: string;
  pricingGuidance: string;
  disclaimer: string;
}

// ── Pricing guidance ──────────────────────────────────────────────────────────

const PRICE_GUIDANCE: Record<string, string> = {
  simple:   "$150–$300 (W-2 only, standard deduction)",
  moderate: "$300–$700 (W-2 + investments or small business)",
  complex:  "$700–$2,500+ (multiple states, rental, S-corp, foreign income)",
};

function detectComplexity(returnDetails: string): string {
  const t = returnDetails.toLowerCase();
  if (t.includes("s-corp") || t.includes("partnership") || t.includes("foreign") ||
      t.includes("multiple state") || t.includes("rental")) return "complex";
  if (t.includes("schedule c") || t.includes("self-employ") || t.includes("invest") ||
      t.includes("espp") || t.includes("rsu") || t.includes("crypto")) return "moderate";
  return "simple";
}

// ── Search query builder ──────────────────────────────────────────────────────

function buildQueries(location: string, returnType: string): string[] {
  const loc = location.replace(/, ?USA?$/i, "").trim();
  const isComplex = /espp|rsu|stock|invest|rental|crypto|self.employ/i.test(returnType);
  return [
    `best CPA tax preparer "${loc}" 2025 individual tax return reviews`,
    `enrolled agent tax preparation "${loc}" pricing affordable 2025`,
    isComplex
      ? `CPA "${loc}" stock compensation RSU ESPP capital gains specialist`
      : `"${loc}" CPA accountant tax filing W-2 schedule reviews`,
    `site:yelp.com tax preparation accountant "${loc}"`,
  ];
}

// ── Search backends ───────────────────────────────────────────────────────────

interface SearchHit { title: string; url: string; snippet: string }

async function tavilySearch(query: string, apiKey: string): Promise<SearchHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key:      apiKey,
      query,
      search_depth: "advanced",
      max_results:  7,
      include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const data = await res.json() as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (data.results ?? []).map(r => ({
    title:   r.title   ?? "",
    url:     r.url     ?? "",
    snippet: r.content ?? "",
  }));
}

async function braveSearch(query: string, apiKey: string): Promise<SearchHit[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=7`;
  const res = await fetch(url, {
    headers: { "Accept": "application/json", "X-Subscription-Token": apiKey },
  });
  if (!res.ok) throw new Error(`Brave ${res.status}`);
  const data = await res.json() as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };
  return (data.web?.results ?? []).map(r => ({
    title:   r.title       ?? "",
    url:     r.url         ?? "",
    snippet: r.description ?? "",
  }));
}

async function ddgLiteSearch(query: string): Promise<SearchHit[]> {
  // DuckDuckGo Lite — POST endpoint with simpler, more stable HTML structure
  const body = new URLSearchParams({ q: query, kl: "us-en" }).toString();
  const res = await fetch("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer":      "https://lite.duckduckgo.com/",
      "Accept":       "text/html,application/xhtml+xml",
    },
    body,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    console.warn(`[cpa-finder] DDG lite HTTP ${res.status} for query: ${query.slice(0, 60)}`);
    return [];
  }

  const html = await res.text();

  // DDG Lite HTML structure: links are in <a class="result-link"> tags,
  // snippets are in <td class="result-snippet"> tags
  const hits: SearchHit[] = [];

  const linkRe    = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

  const links: Array<{ url: string; title: string }> = [];
  const snippets: string[] = [];

  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && links.length < 10) {
    links.push({
      url:   m[1]!.trim(),
      title: m[2]!.replace(/<[^>]+>/g, "").trim(),
    });
  }
  while ((m = snippetRe.exec(html)) !== null && snippets.length < 10) {
    snippets.push(m[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  }

  for (let i = 0; i < Math.min(links.length, 8); i++) {
    if (links[i]!.title.length > 2) {
      hits.push({ url: links[i]!.url, title: links[i]!.title, snippet: snippets[i] ?? "" });
    }
  }

  if (hits.length === 0) {
    // Fallback: grab any anchor text + surrounding td content
    const anyLinkRe = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]{5,80})<\/a>/g;
    while ((m = anyLinkRe.exec(html)) !== null && hits.length < 6) {
      hits.push({ url: m[1]!, title: m[2]!.trim(), snippet: "" });
    }
  }

  console.log(`[cpa-finder] DDG lite → ${hits.length} hits for: ${query.slice(0, 60)}`);
  return hits;
}

// ── Multi-query parallel search ───────────────────────────────────────────────

async function runSearches(queries: string[]): Promise<SearchHit[]> {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  const braveKey  = process.env.BRAVE_API_KEY?.trim();

  const results = await Promise.allSettled(
    queries.map(q => {
      if (tavilyKey) return tavilySearch(q, tavilyKey);
      if (braveKey)  return braveSearch(q, braveKey);
      return ddgLiteSearch(q);
    })
  );

  const hits: SearchHit[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") hits.push(...r.value);
  }
  return hits;
}

// ── Claude haiku synthesis ────────────────────────────────────────────────────

async function synthesizeWithClaude(
  hits: SearchHit[],
  location: string,
  returnType: string,
  maxResults: number,
  apiKey: string,
): Promise<CPAResult[]> {
  if (hits.length === 0) return [];

  const client = new Anthropic({ apiKey });

  // Compact the search results for the prompt
  const context = hits
    .slice(0, 20)
    .map((h, i) => `[${i + 1}] ${h.title}\n    URL: ${h.url}\n    ${h.snippet}`)
    .join("\n\n");

  const message = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `You are extracting CPA/tax professional listings from web search results.

LOCATION: ${location}
RETURN TYPE: ${returnType || "individual tax return"}

SEARCH RESULTS:
${context}

Extract up to ${maxResults} distinct tax professionals (CPAs, Enrolled Agents, tax firms).
For each, output a JSON object on one line:
{"name":"...","type":"CPA|EA|Tax Firm|Unknown","location":"...","phone":"...","website":"...","rating":4.8,"reviewCount":120,"estimatedPrice":"$X–$Y","specialties":["..."],"source":"...","address":"..."}

Rules:
- Only include actual businesses/individuals offering tax prep services
- "type": use EA if "enrolled agent" mentioned, CPA if CPA mentioned, "Tax Firm" for firms
- "rating": only if a numeric rating is explicitly mentioned
- "phone": only if a real phone number (XXX-XXX-XXXX format) is in the text
- "estimatedPrice": only if a price range is mentioned
- "specialties": pick from [W-2, Small Business, Self-Employed, Real Estate, Crypto, International, RSU/ESPP, High Income, IRS Audit]
- "source": just the domain name (e.g. yelp.com)
- Skip duplicates, skip generic listings (H&R Block, TurboTax)
- If a field is unknown, omit it entirely
- Output ONLY the JSON lines, no other text`,
    }],
  });

  const text = message.content[0]?.type === "text" ? message.content[0].text : "";
  const cpas: CPAResult[] = [];

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as CPAResult;
      if (parsed.name && parsed.type) cpas.push(parsed);
    } catch { /* skip malformed lines */ }
  }

  return cpas;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function findCPAs(params: {
  location: string;
  returnDetails: string;
  braveApiKey?: string;
  maxResults?: number;
  anthropicApiKey?: string;
}): Promise<CPASearchResult> {
  const {
    location,
    returnDetails,
    maxResults = 5,
    anthropicApiKey,
  } = params;

  const apiKey  = anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
  const complexity = detectComplexity(returnDetails);
  const queries    = buildQueries(location, returnDetails);

  // 1. Run multi-query searches in parallel
  const hits = await runSearches(queries).catch(() => [] as SearchHit[]);

  // 2. Synthesize with Claude (if API key available) or fallback to regex parsing
  let cpas: CPAResult[] = [];
  if (apiKey && hits.length > 0) {
    cpas = await synthesizeWithClaude(hits, location, returnDetails, maxResults, apiKey)
      .catch(() => []);
  }

  // 3. Deduplicate by name
  const seen = new Set<string>();
  const deduped = cpas.filter(c => {
    const key = c.name.toLowerCase().slice(0, 25);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const top = deduped.slice(0, maxResults);

  const searchBackend = process.env.TAVILY_API_KEY ? "Tavily"
    : process.env.BRAVE_API_KEY                   ? "Brave Search"
    : "DuckDuckGo";

  const pricingGuidance = [
    `💡 EXPECTED COST RANGE for ${complexity.toUpperCase()} return:`,
    `   ${PRICE_GUIDANCE[complexity]}`,
    ``,
    `💡 Ways to save money:`,
    `   • Use an EA instead of CPA (same IRS authority, 20–40% cheaper)`,
    `   • Book before March 15 to avoid peak-season surcharges`,
    `   • Arrive organized (reduces prep time = lower cost)`,
    `   • Ask for a fixed-fee quote, not hourly`,
  ].join("\n");

  const searchSummary = top.length > 0
    ? `Found ${top.length} tax professionals near ${location} (via ${searchBackend} + AI synthesis)`
    : `Limited results for ${location} via ${searchBackend}. Use IRS.gov/taxpros to find verified professionals.`;

  return {
    cpas: top,
    searchSummary,
    pricingGuidance,
    disclaimer:
      "⚠ Always verify credentials at IRS.gov/taxpros before engaging any tax professional. " +
      "Prices are estimates — request a quote for your specific situation.",
  };
}

/** Format full CPA list for SMS message. */
export function formatCPAListForSms(result: CPASearchResult): string {
  const lines: string[] = ["👔 TAX PROFESSIONALS NEAR YOU", result.searchSummary, ""];

  if (result.cpas.length === 0) {
    lines.push("No results found via web search.");
    lines.push("→ Try IRS.gov/taxpros to find licensed preparers.");
  } else {
    result.cpas.forEach((cpa, i) => {
      lines.push(`${i + 1}. ${cpa.name} (${cpa.type})`);
      if (cpa.rating)         lines.push(`   ⭐ ${cpa.rating}${cpa.reviewCount ? ` (${cpa.reviewCount} reviews)` : ""}`);
      if (cpa.estimatedPrice) lines.push(`   💰 ${cpa.estimatedPrice}`);
      if (cpa.phone)          lines.push(`   📞 ${cpa.phone}`);
      if (cpa.address)        lines.push(`   📍 ${cpa.address}`);
      if (cpa.specialties?.length) lines.push(`   🎯 ${cpa.specialties.join(", ")}`);
      if (cpa.website)        lines.push(`   🔗 ${cpa.website}`);
      lines.push("");
    });
  }

  lines.push(result.pricingGuidance, "", result.disclaimer);
  return lines.join("\n");
}

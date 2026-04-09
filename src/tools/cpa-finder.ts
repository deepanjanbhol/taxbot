/**
 * cpa-finder.ts
 *
 * Three-tier CPA/tax-pro search:
 *   Tier 1 — Online services  (H&R Block, TurboTax Live, TaxAct, FreeTaxUSA …)
 *   Tier 2 — Freelancers      (Upwork, Fiverr, local EAs)
 *   Tier 3 — Local CPAs / firms
 *
 * Search backend priority: Tavily → Brave → DuckDuckGo (no key required)
 * Claude Haiku synthesizes web results into structured entries.
 */

import Anthropic from "@anthropic-ai/sdk";

export interface CPAResult {
  name: string;
  type: "CPA" | "EA" | "Tax Firm" | "Online Service" | "Freelancer" | "Unknown";
  location: string;
  phone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  estimatedPrice?: string;
  priceMin?: number;      // for sorting
  specialties: string[];
  source: string;
  address?: string;
  tier: 1 | 2 | 3;       // 1=online, 2=freelancer/EA, 3=local CPA
  bestFor?: string;       // "Simple W-2", "Self-Employed", etc.
  quoteUrl?: string;      // direct link to get a quote
  recommended?: boolean;
}

export interface CPASearchResult {
  cpas: CPAResult[];
  searchSummary: string;
  pricingGuidance: string;
  disclaimer: string;
}

// ── Tier 1: well-known online services with verified 2025 pricing ────────────
// Pricing sourced from each provider's 2025 published rate cards.

function getOnlineServices(complexity: string): CPAResult[] {
  const isSimple   = complexity === "simple";
  const isComplex  = complexity === "complex";

  return [
    {
      name: "FreeTaxUSA",
      type: "Online Service",
      location: "Online",
      website: "https://www.freetaxusa.com",
      quoteUrl: "https://www.freetaxusa.com",
      estimatedPrice: isSimple ? "Free federal / $14.99 state" : "$6.99 federal / $14.99 state",
      priceMin: 0,
      rating: 4.6,
      reviewCount: 45000,
      specialties: ["W-2", "Self-Employed", "Small Business", "Investments"],
      source: "freetaxusa.com",
      tier: 1,
      bestFor: "Best price — comparable features to TurboTax",
      recommended: isSimple,
    },
    {
      name: "TaxAct Online",
      type: "Online Service",
      location: "Online",
      website: "https://www.taxact.com",
      quoteUrl: "https://www.taxact.com/tax-software/pricing",
      estimatedPrice: isSimple ? "Free–$24.99" : isComplex ? "$64.95 + state" : "$34.95 + state",
      priceMin: isSimple ? 0 : 35,
      rating: 4.3,
      reviewCount: 22000,
      specialties: ["W-2", "Investments", "Small Business", "Self-Employed"],
      source: "taxact.com",
      tier: 1,
      bestFor: "Good value for moderate complexity",
    },
    {
      name: "H&R Block Online",
      type: "Online Service",
      location: "Online + In-person locations",
      website: "https://www.hrblock.com",
      quoteUrl: "https://www.hrblock.com/tax-prep-checklist/tax-prep-pricing",
      estimatedPrice: isSimple ? "Free–$35" : isComplex ? "$115 + state" : "$65 + state",
      priceMin: isSimple ? 0 : 65,
      rating: 4.5,
      reviewCount: 180000,
      specialties: ["W-2", "Self-Employed", "Small Business", "Investments", "IRS Audit"],
      source: "hrblock.com",
      tier: 1,
      bestFor: "Best for in-person + online hybrid",
    },
    {
      name: "TurboTax Live Assisted",
      type: "Online Service",
      location: "Online",
      website: "https://turbotax.intuit.com",
      quoteUrl: "https://turbotax.intuit.com/personal-taxes/online/live/",
      estimatedPrice: isSimple ? "$89 + state" : isComplex ? "$219 + state" : "$139 + state",
      priceMin: isSimple ? 89 : 139,
      rating: 4.7,
      reviewCount: 700000,
      specialties: ["W-2", "Investments", "RSU/ESPP", "Self-Employed", "Crypto", "Small Business"],
      source: "turbotax.intuit.com",
      tier: 1,
      bestFor: "CPA reviews your return before filing",
    },
    {
      name: "TurboTax Live Full Service",
      type: "Online Service",
      location: "Online",
      website: "https://turbotax.intuit.com",
      quoteUrl: "https://turbotax.intuit.com/personal-taxes/online/live/full-service/",
      estimatedPrice: isSimple ? "$89+" : isComplex ? "$499+" : "$219+",
      priceMin: isSimple ? 89 : 219,
      rating: 4.7,
      reviewCount: 700000,
      specialties: ["W-2", "Investments", "RSU/ESPP", "Self-Employed", "Crypto", "High Income"],
      source: "turbotax.intuit.com",
      tier: 1,
      bestFor: "CPA does your taxes entirely",
      recommended: isComplex,
    },
    {
      name: "H&R Block Tax Pro (In-Person)",
      type: "Tax Firm",
      location: "Nationwide locations",
      website: "https://www.hrblock.com/tax-offices/",
      quoteUrl: "https://www.hrblock.com/tax-offices/",
      estimatedPrice: isSimple ? "$150–$220" : isComplex ? "$300–$600" : "$220–$350",
      priceMin: isSimple ? 150 : 220,
      rating: 4.4,
      reviewCount: 80000,
      specialties: ["W-2", "Self-Employed", "Small Business", "IRS Audit", "ITIN"],
      source: "hrblock.com",
      tier: 1,
      bestFor: "In-person with flat-fee pricing",
    },
    {
      name: "Jackson Hewitt",
      type: "Tax Firm",
      location: "Nationwide (Walmart, standalone offices)",
      website: "https://www.jacksonhewitt.com",
      quoteUrl: "https://www.jacksonhewitt.com/tax-service-pricing/",
      estimatedPrice: isSimple ? "$25 flat" : "$150–$400",
      priceMin: 25,
      rating: 4.1,
      reviewCount: 35000,
      specialties: ["W-2", "ITIN", "Refund Advance"],
      source: "jacksonhewitt.com",
      tier: 1,
      bestFor: "Flat-fee filing, convenient locations",
    },
  ];
}

// ── Tier 2: freelancer platforms ──────────────────────────────────────────────

function getFreelancerPlatforms(): CPAResult[] {
  return [
    {
      name: "Upwork — Tax Accountants",
      type: "Freelancer",
      location: "Remote (US-based CPAs/EAs)",
      website: "https://www.upwork.com/hire/tax-accountants/",
      quoteUrl: "https://www.upwork.com/hire/tax-accountants/",
      estimatedPrice: "$50–$300 (fixed price, compare bids)",
      priceMin: 50,
      rating: 4.7,
      reviewCount: 12000,
      specialties: ["W-2", "Self-Employed", "Small Business", "Investments", "Crypto", "International"],
      source: "upwork.com",
      tier: 2,
      bestFor: "Compare multiple bids from CPAs/EAs — post your job free",
    },
    {
      name: "Fiverr — Tax Filing Pros",
      type: "Freelancer",
      location: "Remote (US & international CPAs)",
      website: "https://www.fiverr.com/categories/finance/tax-filing",
      quoteUrl: "https://www.fiverr.com/categories/finance/tax-filing",
      estimatedPrice: "$25–$200 per return",
      priceMin: 25,
      rating: 4.5,
      reviewCount: 8000,
      specialties: ["W-2", "1099-NEC", "Self-Employed", "Small Business", "Crypto"],
      source: "fiverr.com",
      tier: 2,
      bestFor: "Lowest cost freelancers — verify US licensing",
    },
    {
      name: "Bench — Bookkeeping + Tax",
      type: "Online Service",
      location: "Online",
      website: "https://bench.co",
      quoteUrl: "https://bench.co/pricing/",
      estimatedPrice: "$299/mo (includes tax filing for business owners)",
      priceMin: 299,
      rating: 4.6,
      reviewCount: 9000,
      specialties: ["Small Business", "Self-Employed", "1099-NEC", "Schedule C"],
      source: "bench.co",
      tier: 2,
      bestFor: "Self-employed / freelancers needing bookkeeping + taxes",
    },
  ];
}

// ── Search query builder (expanded to include national chains + freelancers) ──

function buildQueries(location: string, returnType: string): string[] {
  const loc = location.replace(/, ?USA?$/i, "").trim();
  const isComplex = /espp|rsu|stock|invest|rental|crypto|self.employ/i.test(returnType);
  return [
    `CPA enrolled agent tax preparer "${loc}" 2025 reviews pricing`,
    `affordable tax preparation "${loc}" freelance accountant 2025`,
    isComplex
      ? `CPA "${loc}" RSU ESPP capital gains crypto specialist reviews`
      : `"${loc}" tax preparer W-2 affordable reviews`,
    `site:yelp.com OR site:google.com tax accountant CPA "${loc}"`,
  ];
}

// ── Search backends ───────────────────────────────────────────────────────────

interface SearchHit { title: string; url: string; snippet: string }

async function tavilySearch(query: string, apiKey: string): Promise<SearchHit[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, search_depth: "advanced", max_results: 7 }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const data = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).map(r => ({ title: r.title ?? "", url: r.url ?? "", snippet: r.content ?? "" }));
}

async function braveSearch(query: string, apiKey: string): Promise<SearchHit[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=7`;
  const res = await fetch(url, { headers: { "Accept": "application/json", "X-Subscription-Token": apiKey } });
  if (!res.ok) throw new Error(`Brave ${res.status}`);
  const data = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (data.web?.results ?? []).map(r => ({ title: r.title ?? "", url: r.url ?? "", snippet: r.description ?? "" }));
}

async function ddgLiteSearch(query: string): Promise<SearchHit[]> {
  const body = new URLSearchParams({ q: query, kl: "us-en" }).toString();
  const res = await fetch("https://lite.duckduckgo.com/lite/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://lite.duckduckgo.com/",
      "Accept": "text/html,application/xhtml+xml",
    },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];

  const html = await res.text();
  const hits: SearchHit[] = [];
  const linkRe    = /<a[^>]+class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<td[^>]+class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
  const links: Array<{ url: string; title: string }> = [];
  const snippets: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null && links.length < 10)
    links.push({ url: m[1]!.trim(), title: m[2]!.replace(/<[^>]+>/g, "").trim() });
  while ((m = snippetRe.exec(html)) !== null && snippets.length < 10)
    snippets.push(m[1]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
  for (let i = 0; i < Math.min(links.length, 8); i++)
    if (links[i]!.title.length > 2)
      hits.push({ url: links[i]!.url, title: links[i]!.title, snippet: snippets[i] ?? "" });
  return hits;
}

async function runSearches(queries: string[]): Promise<SearchHit[]> {
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  const braveKey  = process.env.BRAVE_API_KEY?.trim();
  const results   = await Promise.allSettled(
    queries.map(q => tavilyKey ? tavilySearch(q, tavilyKey) : braveKey ? braveSearch(q, braveKey) : ddgLiteSearch(q))
  );
  return results.flatMap(r => r.status === "fulfilled" ? r.value : []);
}

// ── Claude Haiku synthesis for local CPAs ─────────────────────────────────────

async function synthesizeLocalCPAs(
  hits: SearchHit[],
  location: string,
  returnType: string,
  apiKey: string,
): Promise<CPAResult[]> {
  if (hits.length === 0) return [];

  const context = hits.slice(0, 20)
    .map((h, i) => `[${i + 1}] ${h.title}\n    URL: ${h.url}\n    ${h.snippet}`)
    .join("\n\n");

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{
      role: "user",
      content: `Extract local/regional CPA, Enrolled Agent, and tax firm listings from these search results.
LOCATION: ${location}
RETURN TYPE: ${returnType || "individual tax return"}

SEARCH RESULTS:
${context}

For each LOCAL professional found (not online-only services), output one JSON per line:
{"name":"...","type":"CPA|EA|Tax Firm","location":"${location}","phone":"...","website":"...","rating":4.8,"reviewCount":120,"estimatedPrice":"$X–$Y","priceMin":250,"specialties":["..."],"source":"...","address":"...","tier":3,"bestFor":"...","quoteUrl":"..."}

Rules:
- Include: local CPAs, local EAs, regional tax firms, local H&R Block offices (with address)
- Include: any accountant or bookkeeper offering tax prep services
- Do NOT skip national chains if they have a local address listed
- "type": EA if "enrolled agent", CPA if licensed CPA, "Tax Firm" for firms/offices
- "rating": only if explicitly stated as a numeric rating
- "phone": only XXX-XXX-XXXX format found in the text
- "estimatedPrice": only if a price range is in the text
- "priceMin": your best estimate of the lowest price (integer, no $ sign)
- "specialties": from [W-2, Small Business, Self-Employed, Real Estate, Crypto, International, RSU/ESPP, High Income, IRS Audit, ITIN, Bookkeeping]
- "quoteUrl": the website URL where one can get a quote
- Skip duplicates
- Output ONLY JSON lines, no other text`,
    }],
  });

  const text = message.content[0]?.type === "text" ? message.content[0].text : "";
  const cpas: CPAResult[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(trimmed) as CPAResult;
      if (parsed.name && parsed.type) cpas.push({ ...parsed, tier: 3 });
    } catch { /* skip malformed */ }
  }
  return cpas;
}

// ── Pricing guidance ──────────────────────────────────────────────────────────

const PRICE_GUIDANCE: Record<string, string> = {
  simple:   "$0–$35 online (DIY) · $150–$300 with a pro",
  moderate: "$35–$115 online assisted · $300–$700 local CPA",
  complex:  "$100–$500 online assisted · $700–$2,500+ local CPA",
};

function detectComplexity(returnDetails: string): string {
  const t = returnDetails.toLowerCase();
  if (t.includes("s-corp") || t.includes("partnership") || t.includes("foreign") ||
      t.includes("multiple state") || t.includes("rental")) return "complex";
  if (t.includes("schedule c") || t.includes("self-employ") || t.includes("invest") ||
      t.includes("espp") || t.includes("rsu") || t.includes("crypto")) return "moderate";
  return "simple";
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function findCPAs(params: {
  location: string;
  returnDetails: string;
  maxResults?: number;
  anthropicApiKey?: string;
}): Promise<CPASearchResult> {
  const { location, returnDetails, maxResults = 10, anthropicApiKey } = params;
  const apiKey     = anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
  const complexity = detectComplexity(returnDetails);

  // Run in parallel: web searches for local CPAs + curated service lists
  const [hits, onlineServices, freelancerPlatforms] = await Promise.all([
    runSearches(buildQueries(location, returnDetails)).catch(() => [] as SearchHit[]),
    Promise.resolve(getOnlineServices(complexity)),
    Promise.resolve(getFreelancerPlatforms()),
  ]);

  // Synthesize local CPA results from search
  let localCPAs: CPAResult[] = [];
  if (apiKey && hits.length > 0) {
    localCPAs = await synthesizeLocalCPAs(hits, location, returnDetails, apiKey).catch(() => []);
  }

  // Deduplicate local CPAs by name
  const seen = new Set<string>();
  const deduped = localCPAs.filter(c => {
    const key = c.name.toLowerCase().slice(0, 25);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Combine all tiers and sort by: tier ASC, then priceMin ASC
  const all: CPAResult[] = [
    ...onlineServices,
    ...freelancerPlatforms,
    ...deduped.slice(0, 5),
  ].sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return (a.priceMin ?? 999) - (b.priceMin ?? 999);
  });

  const top = all.slice(0, maxResults);

  const searchBackend = process.env.TAVILY_API_KEY ? "Tavily"
    : process.env.BRAVE_API_KEY ? "Brave Search"
    : "DuckDuckGo";

  const localCount = deduped.length;
  const searchSummary = `${onlineServices.length + freelancerPlatforms.length} online/remote options + ${localCount} local pros near ${location} (via ${searchBackend})`;

  const pricingGuidance = [
    `💡 EXPECTED COST for ${complexity.toUpperCase()} return:`,
    `   ${PRICE_GUIDANCE[complexity]}`,
    ``,
    `💡 How to get the best deal:`,
    `   • Online DIY (FreeTaxUSA, TaxAct) — cheapest if you're comfortable filing yourself`,
    `   • Upwork/Fiverr — post your job and compare bids from US CPAs/EAs`,
    `   • Local EA vs CPA — EAs have same IRS authority, typically 20–40% cheaper`,
    `   • Book before March 15 to avoid peak-season surcharges`,
    `   • Always ask for a fixed-fee quote, not hourly`,
  ].join("\n");

  return {
    cpas: top,
    searchSummary,
    pricingGuidance,
    disclaimer:
      "⚠ Verify credentials at IRS.gov/taxpros · Prices are 2025 estimates — always confirm before engaging.",
  };
}

/** Format full CPA list for SMS message. */
export function formatCPAListForSms(result: CPASearchResult): string {
  const lines: string[] = ["👔 TAX PROFESSIONAL OPTIONS", result.searchSummary, ""];

  if (result.cpas.length === 0) {
    lines.push("→ FreeTaxUSA.com — free federal filing");
    lines.push("→ Upwork.com/hire/tax-accountants — compare bids");
    lines.push("→ IRS.gov/taxpros — find licensed local preparers");
  } else {
    const tier1 = result.cpas.filter(c => c.tier === 1);
    const tier2 = result.cpas.filter(c => c.tier === 2);
    const tier3 = result.cpas.filter(c => c.tier === 3);

    if (tier1.length) {
      lines.push("── ONLINE SERVICES ──");
      tier1.slice(0, 3).forEach(c => {
        lines.push(`• ${c.name}${c.recommended ? " ⭐ RECOMMENDED" : ""}`);
        if (c.estimatedPrice) lines.push(`  💰 ${c.estimatedPrice}`);
        if (c.bestFor)        lines.push(`  → ${c.bestFor}`);
        if (c.quoteUrl)       lines.push(`  🔗 ${c.quoteUrl}`);
        lines.push("");
      });
    }
    if (tier2.length) {
      lines.push("── FREELANCERS / REMOTE ──");
      tier2.slice(0, 2).forEach(c => {
        lines.push(`• ${c.name}`);
        if (c.estimatedPrice) lines.push(`  💰 ${c.estimatedPrice}`);
        if (c.bestFor)        lines.push(`  → ${c.bestFor}`);
        if (c.quoteUrl)       lines.push(`  🔗 ${c.quoteUrl}`);
        lines.push("");
      });
    }
    if (tier3.length) {
      lines.push("── LOCAL PROS ──");
      tier3.slice(0, 3).forEach(c => {
        lines.push(`• ${c.name} (${c.type})`);
        if (c.rating)         lines.push(`  ⭐ ${c.rating}${c.reviewCount ? ` (${c.reviewCount} reviews)` : ""}`);
        if (c.estimatedPrice) lines.push(`  💰 ${c.estimatedPrice}`);
        if (c.phone)          lines.push(`  📞 ${c.phone}`);
        if (c.address)        lines.push(`  📍 ${c.address}`);
        lines.push("");
      });
    }
  }

  lines.push(result.pricingGuidance, "", result.disclaimer);
  return lines.join("\n");
}

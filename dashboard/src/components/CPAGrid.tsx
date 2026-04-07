import { useState } from "react";
import { MapPin, Star, RefreshCw, ShieldCheck, MessageCircle, ChevronDown } from "lucide-react";
import { usePipelineStore } from "../store/pipeline";
import type { CPACardData } from "../types/pipeline";

// ── Star rating ───────────────────────────────────────────────────────────────

function StarRating({ rating, count }: { rating: number; count?: number }) {
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map(i => (
          <Star
            key={i}
            style={{ width: 12, height: 12 }}
            className={i <= Math.round(rating) ? "text-amber-400 fill-amber-400" : "text-gray-200 fill-gray-200"}
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-gray-700">{rating.toFixed(1)}</span>
      {count !== undefined && <span className="text-xs text-gray-400">({count} reviews)</span>}
    </div>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700",
  "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function Avatar({ name, index }: { name: string; index: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
  return (
    <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-bold text-sm ${color}`}>
      {initials}
    </div>
  );
}

// ── CPA card (horizontal) ─────────────────────────────────────────────────────

function CPACard({ cpa, index }: { cpa: CPACardData; index: number }) {
  const typeLabel = cpa.type === "Unknown" ? "Tax Professional" : cpa.type;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex gap-4 hover:shadow-md transition-shadow relative">
      {/* Avatar */}
      <Avatar name={cpa.name} index={index} />

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">
              {cpa.name}
              <span className="text-gray-400 font-normal">, {typeLabel}</span>
            </p>
            <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
              <MapPin style={{ width: 11, height: 11 }} />
              {cpa.location}
            </p>
          </div>

          {/* Price badge */}
          {cpa.estimatedPrice && (
            <span className="shrink-0 text-xs font-bold text-blue-600 bg-blue-50 border border-blue-100 px-2.5 py-1 rounded-lg whitespace-nowrap">
              {cpa.estimatedPrice}
            </span>
          )}
        </div>

        {/* Rating */}
        {cpa.rating !== undefined && (
          <div className="mt-2">
            <StarRating rating={cpa.rating} count={cpa.reviewCount} />
          </div>
        )}

        {/* Specialty tags */}
        {cpa.specialties.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {cpa.specialties.slice(0, 3).map(s => (
              <span key={s} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium border border-gray-200">
                {s}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Market Insight panel ──────────────────────────────────────────────────────

function MarketInsight() {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mt-4">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Market Insight</p>
      <div className="space-y-2">
        {[
          { label: "Simple 1040",          range: "$250–$450" },
          { label: "Self-Employed / LLC",  range: "$600–$1,200" },
          { label: "Complex HNW",          range: "$2,500+" },
        ].map(({ label, range }) => (
          <div key={label} className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-xs font-bold text-gray-800">{range}</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-gray-400 italic mt-3 leading-relaxed border-t border-gray-50 pt-3">
        "EAs often charge 20–40% less than CPAs for the same return quality."
      </p>
    </div>
  );
}

// ── Map embed ─────────────────────────────────────────────────────────────────

function MapPanel({ location }: { location: string }) {
  const [mapType, setMapType] = useState<"Standard" | "Traffic">("Standard");
  // Use OpenStreetMap embed centered on the searched location
  const encoded = encodeURIComponent(location || "Seattle, WA");
  // OpenStreetMap search embed
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=-122.5%2C47.45%2C-122.1%2C47.75&layer=mapnik&marker=47.6062%2C-122.3321`;

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col" style={{ minHeight: 420 }}>
      {/* Map type toggle */}
      <div className="flex items-center gap-1 p-3 border-b border-gray-100">
        {(["Standard", "Traffic"] as const).map(t => (
          <button
            key={t}
            onClick={() => setMapType(t)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              mapType === t
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
            }`}
          >
            {t}
          </button>
        ))}
        <p className="ml-auto text-[10px] text-gray-400 flex items-center gap-1">
          <MapPin style={{ width: 10, height: 10 }} />
          {location || "Seattle, WA"}
        </p>
      </div>

      {/* Map iframe */}
      <div className="flex-1 relative">
        <iframe
          title="CPA location map"
          src={src}
          className="w-full h-full border-0"
          style={{ minHeight: 360 }}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

type PriceFilter = "all" | "budget" | "moderate" | "premium";
type SpecialtyFilter = "all" | "Individual Tax" | "Business" | "Self-Employed" | "Investment";

export function CPAGrid() {
  const { cpas, config } = usePipelineStore();
  const [priceFilter, setPriceFilter]       = useState<PriceFilter>("moderate");
  const [specialtyFilter, setSpecialtyFilter] = useState<SpecialtyFilter>("Individual Tax");
  const [chatOpen, setChatOpen]             = useState(false);

  const location = config?.userLocation ?? "Seattle, WA";

  // Price filter logic
  const priceNum = (s?: string) => parseFloat(s?.replace(/[^0-9]/g, "") ?? "9999");
  const filtered = cpas.filter(c => {
    const p = priceNum(c.estimatedPrice);
    if (priceFilter === "budget")   return p < 500;
    if (priceFilter === "moderate") return p >= 500 && p <= 1500;
    if (priceFilter === "premium")  return p > 1500;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (a.rating && b.rating) return b.rating - a.rating;
    if (a.rating) return -1;
    return 1;
  });

  async function handleRefresh() {
    if (!config?.taxDocumentsFolder) return;
    await fetch("/api/pipeline/step/find_cpa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    });
  }

  return (
    <div className="space-y-5 relative">

      {/* Page heading */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-gray-500 flex items-center gap-1">
            <MapPin style={{ width: 13, height: 13 }} className="text-blue-600" />
            {location}
          </span>
        </div>
        <div className="flex items-start justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tax Professionals near {location.split(",")[0]}</h1>
            <p className="text-sm text-gray-400 mt-0.5">Find elite, verified tax professionals matched to your financial profile.</p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:text-gray-800 hover:border-gray-300 text-xs font-medium transition-colors"
          >
            <RefreshCw style={{ width: 13, height: 13 }} />
            Refresh
          </button>
        </div>
      </div>

      {/* 3-column layout */}
      <div className="flex gap-5 items-start">

        {/* ── Left: Filters ──────────────────────────────────────────────── */}
        <div className="w-52 shrink-0 space-y-1">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Refine Selection</p>

            {/* Specialty dropdown */}
            <div className="mb-4">
              <p className="text-xs text-gray-500 font-medium mb-1.5">Specialty</p>
              <div className="relative">
                <select
                  value={specialtyFilter}
                  onChange={e => setSpecialtyFilter(e.target.value as SpecialtyFilter)}
                  className="w-full appearance-none text-xs px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-gray-700 outline-none pr-7 font-medium"
                >
                  <option value="all">All Specialties</option>
                  <option value="Individual Tax">Individual Tax</option>
                  <option value="Business">Business</option>
                  <option value="Self-Employed">Self-Employed</option>
                  <option value="Investment">Investment</option>
                </select>
                <ChevronDown style={{ width: 12, height: 12 }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>

            {/* Price range */}
            <div>
              <p className="text-xs text-gray-500 font-medium mb-1.5">Price Range</p>
              <div className="flex flex-col gap-1.5">
                {([
                  { key: "budget",   label: "Under $500" },
                  { key: "moderate", label: "$ Moderate" },
                  { key: "premium",  label: "Premium" },
                ] as { key: PriceFilter; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setPriceFilter(key)}
                    className={`w-full text-xs px-3 py-2 rounded-lg border font-medium transition-colors text-left ${
                      priceFilter === key
                        ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <MarketInsight />

          {/* IRS verify */}
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mt-1">
            <div className="flex items-start gap-2">
              <ShieldCheck style={{ width: 14, height: 14 }} className="text-blue-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-gray-400 leading-relaxed">
                <span className="font-semibold text-gray-600">Verify credentials</span> at the{" "}
                <a
                  href="https://irs.treasury.gov/rpo/rpo.jsf"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 underline hover:text-blue-800"
                >
                  IRS Preparer Directory
                </a>{" "}
                before hiring.
              </p>
            </div>
          </div>
        </div>

        {/* ── Center: CPA cards ──────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-3">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[40vh] bg-white rounded-2xl border border-gray-100 shadow-sm gap-4 text-center p-10">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                <MapPin style={{ width: 22, height: 22 }} className="text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">No Tax Professionals Found</p>
                <p className="text-sm text-gray-400 mt-1">
                  {cpas.length === 0
                    ? "Run the pipeline to find CPAs near you."
                    : "Try a different price range or specialty filter."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 font-medium">{sorted.length} professional{sorted.length !== 1 ? "s" : ""} found</p>
              {sorted.map((cpa, i) => (
                <CPACard key={i} cpa={cpa} index={i} />
              ))}
            </>
          )}
        </div>

        {/* ── Right: Map ─────────────────────────────────────────────────── */}
        <div className="w-72 shrink-0">
          <MapPanel location={location} />
        </div>
      </div>

      {/* Floating "Ask TaxBot AI" button */}
      <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-2">
        {chatOpen && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-4 w-72 mb-2">
            <p className="text-sm font-semibold text-gray-900 mb-1">Ask TaxBot AI</p>
            <p className="text-xs text-gray-400 mb-3">Which type of professional do I need for my situation?</p>
            <textarea
              rows={3}
              placeholder="Describe your tax situation…"
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 resize-none outline-none focus:border-blue-400 text-gray-700 placeholder-gray-400"
            />
            <button className="mt-2 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold py-2 rounded-lg transition-colors">
              Ask →
            </button>
          </div>
        )}
        <button
          onClick={() => setChatOpen(o => !o)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-full shadow-lg shadow-blue-600/30 text-sm font-semibold transition-all"
        >
          <MessageCircle style={{ width: 16, height: 16 }} />
          Ask TaxBot AI
        </button>
      </div>
    </div>
  );
}

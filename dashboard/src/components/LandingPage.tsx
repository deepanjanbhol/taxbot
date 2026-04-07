import { usePipelineStore } from "../store/pipeline";

// ── Hero product mockup ───────────────────────────────────────────────────────

function ProductMockup() {
  return (
    <div className="relative w-full max-w-md mx-auto lg:mx-0">
      {/* Glow behind card */}
      <div className="absolute inset-0 bg-blue-500/10 rounded-3xl blur-3xl -z-10 scale-110" />

      {/* Main card */}
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 p-6 relative">
        {/* Toggle row */}
        <div className="flex items-center justify-between mb-5">
          <div className="h-2.5 w-28 bg-slate-200 rounded-full" />
          <div className="w-10 h-5 bg-blue-500 rounded-full relative">
            <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow" />
          </div>
        </div>

        {/* Two-column info strip */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[9px] font-bold uppercase tracking-widest text-blue-500 mb-1">AI INSIGHT</p>
            <div className="space-y-1.5">
              <div className="h-2 bg-slate-200 rounded-full w-full" />
              <div className="h-2 bg-slate-200 rounded-full w-4/5" />
              <div className="h-2 bg-slate-200 rounded-full w-3/5" />
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">ESTIMATED REFUND</p>
            <p className="text-xl font-bold text-slate-800 tracking-tight">$4,852.00</p>
          </div>
        </div>

        {/* Document rows */}
        {[
          { icon: "📄", w1: "w-24", w2: "w-16", color: "bg-blue-100" },
          { icon: "📊", w1: "w-32", w2: "w-20", color: "bg-purple-100" },
          { icon: "🧾", w1: "w-20", w2: "w-12", color: "bg-green-100" },
        ].map((row, i) => (
          <div key={i} className="flex items-center gap-3 mb-3 last:mb-0">
            <div className={`w-8 h-8 ${row.color} rounded-lg flex items-center justify-center text-sm flex-shrink-0`}>
              {row.icon}
            </div>
            <div className="flex-1 space-y-1">
              <div className={`h-2 bg-slate-200 rounded-full ${row.w1}`} />
              <div className={`h-1.5 bg-slate-100 rounded-full ${row.w2}`} />
            </div>
            <div className="w-2 h-2 rounded-full bg-green-400" />
          </div>
        ))}

        {/* Progress bar */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1.5">
            <span>Analysis complete</span>
            <span className="text-blue-500 font-semibold">100%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full">
            <div className="h-full w-full bg-blue-500 rounded-full" />
          </div>
        </div>
      </div>

      {/* Floating badge */}
      <div className="absolute -bottom-3 -right-3 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg shadow-green-500/30">
        ✓ Analysis Complete
      </div>
    </div>
  );
}

// ── Feature cards ─────────────────────────────────────────────────────────────

interface Feature {
  icon: string;
  title: string;
  description: string;
  accent: string;
}

const FEATURES: Feature[] = [
  {
    icon: "⚡",
    title: "OpenClaw Multi-Agent Engine",
    description: "Parallel AI agents process your tax documents, cross-referencing fields across all your forms to catch inconsistencies.",
    accent: "border-blue-200 bg-blue-50/50",
  },
  {
    icon: "🔍",
    title: "Document Intelligence",
    description: "Deep-scan any W-2, 1099, or receipt. Extracts every field with AI precision and flags anything missing.",
    accent: "border-purple-200 bg-purple-50/50",
  },
  {
    icon: "📋",
    title: "Automated 1040 Estimate",
    description: "Your Form 1040 estimate computed from your actual documents — with QBI deductions and applicable credits applied where detected.",
    accent: "border-emerald-200 bg-emerald-50/50",
  },
];

// ── Tech stack logos ──────────────────────────────────────────────────────────

const TECH_LOGOS = ["Claude AI", "OpenClaw", "Twilio", "Telegram Bot API"];

// ── Main landing page ─────────────────────────────────────────────────────────

export function LandingPage() {
  const { setActiveTab } = usePipelineStore();

  function launch() {
    setActiveTab("pipeline");
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-['Inter',system-ui,sans-serif]">

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-8">
          {/* Logo */}
          <div className="flex items-center gap-2.5 select-none">
            <img src="/taxbot-logo.png" alt="TaxBot" className="w-8 h-8 object-contain" />
            <span className="font-bold text-slate-900 text-lg tracking-tight">TaxBot</span>
          </div>

          {/* Nav links */}
          <nav className="hidden md:flex items-center gap-7 flex-1">
            {[
              { label: "How it Works", href: "#" },
              { label: "GitHub",       href: "https://github.com", external: true },
            ].map(({ label, href, external }) => (
              <a
                key={label}
                href={href}
                target={external ? "_blank" : undefined}
                rel={external ? "noreferrer" : undefined}
                className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                {label}
              </a>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-3 ml-auto">
            <button
              onClick={launch}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm shadow-blue-600/20"
            >
              Open Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-24">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left */}
          <div>
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
              OPEN SOURCE · SELF-HOSTED
            </div>

            {/* Heading */}
            <h1 className="text-5xl lg:text-6xl font-extrabold leading-[1.08] tracking-tight text-slate-900 mb-5">
              AI-Powered Tax<br />
              Intelligence.<br />
              <span className="text-blue-600">Automated.</span>
            </h1>

            {/* Subtext */}
            <p className="text-lg text-slate-500 leading-relaxed max-w-md mb-8">
              OpenClaw multi-agent systems and precision document parsing to handle your 1040 — from raw documents to a complete filing estimate.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 mb-10">
              <button
                onClick={launch}
                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-all shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40"
              >
                Open Dashboard →
              </button>
              <a
                href="https://github.com/deepanjanbhol/taxbot"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
              >
                <span className="w-8 h-8 rounded-full border-2 border-slate-200 hover:border-slate-400 flex items-center justify-center transition-colors text-xs">
                  ★
                </span>
                View on GitHub
              </a>
            </div>

            {/* Open source indicator */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">
                Free, open source, and runs entirely on your machine.
              </span>
            </div>
          </div>

          {/* Right — product mockup */}
          <ProductMockup />
        </div>
      </section>

      {/* ── Tech stack bar ────────────────────────────────────────────────── */}
      <section className="border-y border-slate-100 bg-slate-50/60 py-5">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-widest">
              Built with
            </div>
            <div className="flex flex-wrap items-center gap-8">
              {TECH_LOGOS.map(name => (
                <span key={name} className="text-sm font-bold text-slate-400 tracking-wide">{name}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-14">
          <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
            Built for the future of finance.
          </h2>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            The power of multiple AI agents working in harmony to ensure your filings are flawless, optimized, and stress-free.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className={`rounded-2xl border p-7 ${f.accent} hover:shadow-md transition-shadow`}
            >
              <div className="w-12 h-12 rounded-xl bg-white border border-slate-100 shadow-sm flex items-center justify-center text-2xl mb-5">
                {f.icon}
              </div>
              <h3 className="font-bold text-slate-900 text-lg mb-3 leading-snug">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="bg-slate-50 border-y border-slate-100 py-24">
        <div className="max-w-6xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
              From documents to estimate in minutes.
            </h2>
            <p className="text-lg text-slate-500 max-w-lg mx-auto">
              Five steps, fully automated. Point TaxBot at your tax folder and it handles the rest — extraction, calculation, CPA search, and delivery.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-6">
            {[
              { step: "01", title: "Point to Your Folder", desc: "Set your tax documents folder in Settings. TaxBot scans PDFs recursively and classifies each file — W-2, 1099-INT, 1099-B, K-1, 1098, and more.", emoji: "📁" },
              { step: "02", title: "AI Field Extraction", desc: "Claude Haiku reads every document and calls a tool for each dollar value found — handling concatenated W-2 boxes, dot-leader 1099-DIVs, K-1 box labels, and rollover codes.", emoji: "🤖" },
              { step: "03", title: "Form 1040 Computed", desc: "Deterministic 2025 bracket calculation: SE tax, LTCG rates, NIIT, QBI deduction, Social Security provisional income, medical floor, SALT cap — standard vs itemized comparison.", emoji: "📋" },
              { step: "04", title: "CPAs Found Near You", desc: "Searches for verified local tax professionals via Tavily, Brave, or DuckDuckGo. Results include ratings, pricing, and specialties — no API key required for the DDG fallback.", emoji: "🗺️" },
              { step: "05", title: "Report Delivered", desc: "Your Form 1040 estimate arrives via SMS (Twilio) or Telegram Bot. Long reports are sent as a file attachment. Falls back to a local saved file if no delivery is configured.", emoji: "📱" },
            ].map(({ step, title, desc, emoji }) => (
              <div key={step} className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm flex items-center justify-center text-2xl mx-auto mb-4">
                  {emoji}
                </div>
                <div className="text-xs font-bold text-blue-500 tracking-widest mb-1">{step}</div>
                <h3 className="font-bold text-slate-800 mb-2">{title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ───────────────────────────────────────────────────── */}
      <section className="bg-slate-900 py-24">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h2 className="text-4xl lg:text-5xl font-extrabold text-white tracking-tight mb-5">
            Ready to experience<br />precision tax filing?
          </h2>
          <p className="text-lg text-slate-400 max-w-md mx-auto mb-10">
            Join professionals who have automated their tax workflow with TaxBot and Claude AI.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={launch}
              className="px-8 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition-all shadow-xl shadow-blue-600/30"
            >
              Open Dashboard →
            </button>
            <a
              href="https://github.com/deepanjanbhol/taxbot"
              target="_blank"
              rel="noreferrer"
              className="px-8 py-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/20 text-white font-semibold text-sm transition-all"
            >
              View on GitHub
            </a>
          </div>
          <p className="text-slate-600 text-xs mt-5">Open source. Self-hosted. Your data never leaves your machine.</p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="bg-white border-t border-slate-100 py-14">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <img src="/taxbot-logo.png" alt="TaxBot" className="w-7 h-7 object-contain" />
                <span className="font-bold text-slate-900">TaxBot</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Open-source AI tax assistant. Runs locally on your machine. Your documents never leave your computer.
              </p>
            </div>

            {/* Links */}
            {[
              { heading: "Product",   links: [{ label: "Dashboard",    href: "#", onClick: () => launch() }, { label: "How it Works", href: "#how" }, { label: "GitHub", href: "https://github.com" }] },
              { heading: "Resources", links: [{ label: "README",       href: "https://github.com" }, { label: "Open an Issue", href: "https://github.com" }] },
            ].map(({ heading, links }) => (
              <div key={heading}>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">{heading}</p>
                <ul className="space-y-2.5">
                  {links.map(link => (
                    <li key={link.label}>
                      <a href={link.href} target={link.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="text-sm text-slate-500 hover:text-slate-800 transition-colors">{link.label}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-100 mt-10 pt-6 flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-slate-400">© 2025 TaxBot. AI estimates only — not a substitute for professional tax advice. Always verify with a licensed CPA before filing.</p>
            <p className="text-xs text-slate-400">Powered by Claude + OpenClaw</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

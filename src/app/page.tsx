"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, CheckCircle2, Server, Mail, Loader2,
  Search, Download, Trash2, BarChart3, RefreshCw,
  LogOut, FileText, Clock, ChevronDown, X, AlertCircle,
  StopCircle, Play, Eye, EyeOff, Copy, ChevronRight,
  Zap, Shield, Activity, TrendingUp, Database, Globe, Filter
} from "lucide-react";

interface EmailEntry {
  id: string; email: string; domain: string; formatValid: boolean;
  domainExists: boolean; nsRecords: string[]; mxRecords: string[];
  aRecord: string | null; providerSlug: string | null; providerName: string | null;
  providerPanel: string | null; providerCountry: string | null;
  detectionMethod: string | null; confidence: string | null;
  isKonsoleh: boolean; isCpanel: boolean; notes: string | null;
  verifiedAt: string; sessionId: string | null;
}

interface SessionData {
  id: string; name: string; totalCount: number;
  konsolehCount: number; cpanelCount: number; createdAt: string;
}

interface ProviderStat {
  slug: string | null; name: string | null; panel: string | null;
  country: string | null; count: number;
}

interface Stats {
  total: number; konsolehCount: number; cpanelCount: number;
  konsolehPercentage: string; cpanelPercentage: string;
  topDomains: Array<{ domain: string; total: number; konsoleh: number; cpanel: number; provider?: string }>;
  sessions: SessionData[];
  providerBreakdown: ProviderStat[];
}

interface Progress {
  completed: number; total: number; done: boolean; stopped: boolean;
  skipped: number; konsolehFound: number; cpanelFound: number; currentEmail: string;
}

type TabType = "verify" | "results" | "analytics";

const PROVIDER_COLORS: Record<string, string> = {
  konsoleh: "bg-emerald-900/40 text-emerald-300 border-emerald-800/40",
  afrihost: "bg-blue-900/40 text-blue-300 border-blue-800/40",
  "1grid": "bg-orange-900/40 text-orange-300 border-orange-800/40",
  elitehost: "bg-purple-900/40 text-purple-300 border-purple-800/40",
  hostafrica: "bg-red-900/40 text-red-300 border-red-800/40",
  cybersmart: "bg-cyan-900/40 text-cyan-300 border-cyan-800/40",
  domains_co_za: "bg-teal-900/40 text-teal-300 border-teal-800/40",
  webafrica: "bg-yellow-900/40 text-yellow-300 border-yellow-800/40",
  rsaweb: "bg-indigo-900/40 text-indigo-300 border-indigo-800/40",
  cloudflare: "bg-orange-900/40 text-orange-300 border-orange-800/40",
  google: "bg-blue-900/40 text-blue-300 border-blue-800/40",
  microsoft: "bg-sky-900/40 text-sky-300 border-sky-800/40",
  godaddy: "bg-green-900/40 text-green-300 border-green-800/40",
  ionos: "bg-indigo-900/40 text-indigo-300 border-indigo-800/40",
};

function badgeClass(slug: string | null) {
  return PROVIDER_COLORS[slug || ""] || "bg-gray-800/60 text-gray-300 border-gray-700/40";
}

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState<TabType>("verify");
  const [emails, setEmails] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [allResults, setAllResults] = useState<EmailEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [selectedProvider, setSelectedProvider] = useState<string>("all");
  const [showProviderMenu, setShowProviderMenu] = useState(false);
  const [showExportAllMenu, setShowExportAllMenu] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [totalResults, setTotalResults] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [liveResults, setLiveResults] = useState<EmailEntry[]>([]);
  const [showLive, setShowLive] = useState(true);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const liveInterval = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressIdRef = useRef<string | null>(null);
  const PAGE_SIZE = 50;

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { if (tab === "results") loadResults(1); }, [search, selectedSession, selectedProvider, tab]);

  async function checkAuth() {
    const res = await fetch("/api/auth/me");
    if (res.status === 401) router.push("/login");
    else { loadResults(1); loadStats(); }
  }

  function notify(msg: string, type: "success" | "error" | "info" = "success") {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 5000);
  }

  async function loadResults(page = 1) {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (selectedSession) params.set("sessionId", selectedSession);
      if (selectedProvider && selectedProvider !== "all") params.set("provider", selectedProvider);
      params.set("limit", String(PAGE_SIZE));
      params.set("page", String(page));
      const res = await fetch(`/api/results?${params}`);
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setAllResults(prev => page === 1 ? (data.results || []) : [...prev, ...(data.results || [])]);
      setTotalResults(data.total || 0);
      setHasMore(data.hasMore || false);
      setCurrentPage(page);
    } catch {}
  }

  async function loadStats() {
    try {
      const res = await fetch("/api/stats");
      if (res.status === 401) return;
      setStats(await res.json());
    } catch {}
  }

  async function stopVerification() {
    if (!progressIdRef.current) return;
    await fetch(`/api/verify?id=${progressIdRef.current}`, { method: "DELETE" });
    notify("Stopping after current batch…", "info");
  }

  async function handleVerify() {
    const emailList = emails.split(/[\n,;]/).map(e => e.trim()).filter(e => e.includes("@"));
    if (emailList.length === 0) { notify("No valid emails found", "error"); return; }

    setVerifying(true); setLiveResults([]); setShowLive(true);
    const progressId = Math.random().toString(36).slice(2);
    progressIdRef.current = progressId;
    setProgress({ completed: 0, total: emailList.length, done: false, stopped: false, skipped: 0, konsolehFound: 0, cpanelFound: 0, currentEmail: "" });

    progressInterval.current = setInterval(async () => {
      try {
        const p: Progress = await fetch(`/api/progress?id=${progressId}`).then(r => r.json());
        setProgress(p);
        if (p.done || p.stopped) clearInterval(progressInterval.current!);
      } catch {}
    }, 600);

    liveInterval.current = setInterval(async () => {
      try {
        const data = await fetch("/api/results?limit=30&page=1").then(r => r.json());
        setLiveResults(data.results || []);
      } catch {}
    }, 2000);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: emailList, sessionName: sessionName || `Scan ${new Date().toLocaleString()}`, progressId }),
      });
      const data = await res.json();
      clearInterval(progressInterval.current!);
      clearInterval(liveInterval.current!);
      if (data.success) {
        const skip = data.skippedCount > 0 ? ` · ${data.skippedCount} skipped` : "";
        notify(`✓ ${data.total} scanned · KonsoleH: ${data.konsolehCount} · cPanel: ${data.cpanelCount}${skip}`);
        setEmails(""); setSessionName(""); setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await loadResults(1); await loadStats(); setTab("results");
      } else {
        notify(data.error || "Scan failed", "error");
      }
    } catch (err: any) {
      clearInterval(progressInterval.current!);
      clearInterval(liveInterval.current!);
      notify(err?.message || "Network error", "error");
    } finally {
      setVerifying(false); progressIdRef.current = null;
      setTimeout(() => setProgress(null), 3000);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = evt => setEmails(evt.target?.result as string);
    reader.readAsText(f);
  }

  async function deleteEntry(id: string) {
    await fetch(`/api/results?id=${id}`, { method: "DELETE" });
    setAllResults(prev => prev.filter(r => r.id !== id));
    setTotalResults(prev => prev - 1);
  }

  async function deleteSession(sid: string) {
    if (!confirm("Delete this session and all its entries?")) return;
    await fetch(`/api/results?sessionId=${sid}`, { method: "DELETE" });
    setSelectedSession(""); await loadResults(1); await loadStats();
    notify("Session deleted");
  }

  async function clearAll() {
    if (!confirm("Delete ALL data? Cannot be undone.")) return;
    await fetch("/api/results", { method: "DELETE" });
    setAllResults([]); setTotalResults(0); await loadStats();
    notify("All data cleared");
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    notify("Copied", "info");
  }

  // Download emails for a specific provider group
  function downloadProviderGroup(providerSlug: string | null, providerName: string | null, groupEmails: EmailEntry[], format: "txt" | "csv") {
    const safeName = (providerName || "unknown").replace(/[^a-z0-9]/gi, "-").toLowerCase();
    if (format === "txt") {
      const content = groupEmails.map(r => r.email).join("\n");
      triggerDownload(content, `${safeName}-emails.txt`, "text/plain");
    } else {
      const content = [
        ["Email", "Domain", "Provider", "Panel", "Country", "Detection", "NS Records", "MX Records"].join(","),
        ...groupEmails.map(r => [
          r.email, r.domain, r.providerName || "Unknown", r.providerPanel || "-",
          r.providerCountry || "-", r.detectionMethod || "-",
          (r.nsRecords || []).join("; "), (r.mxRecords || []).join("; "),
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      ].join("\n");
      triggerDownload(content, `${safeName}-emails.csv`, "text/csv");
    }
  }

  // Download all results grouped by provider
  function downloadAll(format: "txt" | "csv" | "json" | "grouped-txt") {
    setShowExportAllMenu(false);
    const data = allResults;

    if (format === "grouped-txt") {
      // Group by provider, each with a header
      const groups = groupByProvider(data);
      const lines: string[] = [];
      for (const [slug, group] of Array.from(groups)) {
        const name = group.emails[0]?.providerName || "Unknown";
        lines.push(`# ${name} (${group.emails.length} emails)`);
        lines.push(...group.emails.map(r => r.email));
        lines.push("");
      }
      triggerDownload(lines.join("\n"), `all-hosts-grouped-${Date.now()}.txt`, "text/plain");
    } else if (format === "txt") {
      triggerDownload(data.map(r => r.email).join("\n"), `all-emails-${Date.now()}.txt`, "text/plain");
    } else if (format === "csv") {
      const content = [
        ["Email", "Domain", "Provider", "Panel", "Country", "Detection", "Confidence", "KonsoleH", "cPanel", "NS Records", "MX Records", "IP"].join(","),
        ...data.map(r => [
          r.email, r.domain, r.providerName || "Unknown", r.providerPanel || "-",
          r.providerCountry || "-", r.detectionMethod || "-", r.confidence || "-",
          r.isKonsoleh ? "Yes" : "No", r.isCpanel ? "Yes" : "No",
          (r.nsRecords || []).join("; "), (r.mxRecords || []).join("; "), r.aRecord || "-",
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))
      ].join("\n");
      triggerDownload(content, `all-emails-${Date.now()}.csv`, "text/csv");
    } else if (format === "json") {
      triggerDownload(JSON.stringify(data, null, 2), `all-emails-${Date.now()}.json`, "application/json");
    }
  }

  function triggerDownload(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // Group results by provider
  function groupByProvider(results: EmailEntry[]): Map<string, { name: string | null; slug: string | null; panel: string | null; emails: EmailEntry[] }> {
    const map = new Map<string, { name: string | null; slug: string | null; panel: string | null; emails: EmailEntry[] }>();
    for (const r of results) {
      const key = r.providerSlug || "__unknown__";
      if (!map.has(key)) map.set(key, { name: r.providerName, slug: r.providerSlug, panel: r.providerPanel, emails: [] });
      map.get(key)!.emails.push(r);
    }
    // Sort: known providers first, then by count desc
    return new Map([...map.entries()].sort((a, b) => {
      if (a[0] === "__unknown__") return 1;
      if (b[0] === "__unknown__") return -1;
      return b[1].emails.length - a[1].emails.length;
    }));
  }

  const emailCount = emails.split(/[\n,;]/).filter(e => e.trim().includes("@")).length;
  const progressPct = progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const providerGroups = groupByProvider(allResults);
  const activeProviderName = selectedProvider === "all" ? "All Providers" :
    stats?.providerBreakdown.find(p => p.slug === selectedProvider)?.name || selectedProvider;

  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium fade-in flex items-center gap-2 max-w-sm ${
          notification.type === "error" ? "bg-red-950 border border-red-700/50 text-red-200" :
          notification.type === "info" ? "bg-blue-950 border border-blue-700/50 text-blue-200" :
          "bg-emerald-950 border border-emerald-700/50 text-emerald-200"
        }`}>
          {notification.type === "error" ? <AlertCircle size={16} /> : notification.type === "info" ? <Activity size={16} /> : <CheckCircle2 size={16} />}
          {notification.msg}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Domain Host Detector</h1>
              <p className="text-xs" style={{ color: "var(--muted)" }}>KonsoleH · xneelo · cPanel · All SA hosts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {stats && (
              <div className="hidden md:flex items-center gap-3 text-xs px-3 py-1.5 rounded-lg" style={{ background: "var(--panel)", color: "var(--muted)" }}>
                <span><span className="text-white font-semibold">{stats.total.toLocaleString()}</span> scanned</span>
                <span className="opacity-30">|</span>
                <span><span className="text-emerald-400 font-semibold">{stats.konsolehCount.toLocaleString()}</span> KonsoleH</span>
                <span className="opacity-30">|</span>
                <span><span className="text-blue-400 font-semibold">{stats.cpanelCount.toLocaleString()}</span> cPanel</span>
              </div>
            )}
            <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.push("/login"); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition hover:bg-gray-800" style={{ color: "var(--muted)" }}>
              <LogOut size={14} /> Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 p-1 rounded-xl w-fit" style={{ background: "var(--panel)" }}>
          {([
            { id: "verify", label: "Scan", icon: <Zap size={14} /> },
            { id: "results", label: `Results${totalResults > 0 ? ` (${totalResults.toLocaleString()})` : ""}`, icon: <Database size={14} /> },
            { id: "analytics", label: "Analytics", icon: <BarChart3 size={14} /> },
          ] as { id: TabType; label: string; icon: React.ReactNode }[]).map(t => (
            <button key={t.id}
              onClick={() => { setTab(t.id); if (t.id === "results") loadResults(1); if (t.id === "analytics") loadStats(); }}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${tab === t.id ? "bg-blue-600 text-white" : "hover:bg-gray-800"}`}
              style={tab !== t.id ? { color: "var(--muted)" } : {}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── SCAN TAB ── */}
        {tab === "verify" && (
          <div className="grid lg:grid-cols-5 gap-5 fade-in">
            <div className="lg:col-span-3 glass rounded-xl p-5">
              <h2 className="text-sm font-semibold mb-4 flex items-center gap-2"><Upload size={15} /> Email Input</h2>
              <input type="text" placeholder="Session name (optional)" value={sessionName}
                onChange={e => setSessionName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg mb-3 bg-gray-800 border border-gray-700 outline-none focus:border-blue-500 transition text-sm" />
              <textarea
                placeholder={"Paste emails — one per line, comma or semicolon separated\n\nDetects: KonsoleH, Afrihost, 1-Grid, Elitehost, HostAfrica,\nCybersmart, GoDaddy, Google Workspace, Microsoft 365, Cloudflare, and more\n\nResults are grouped by hosting provider so you can\ndownload each host's emails separately."}
                value={emails} onChange={e => setEmails(e.target.value)}
                className="w-full h-52 px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 outline-none focus:border-blue-500 transition font-mono text-xs resize-none" />
              <div className="flex items-center justify-between mt-2 mb-3 text-xs" style={{ color: "var(--muted)" }}>
                <span>{emailCount > 0 ? <><span className="text-white font-semibold">{emailCount.toLocaleString()}</span> emails</> : "No emails detected"}</span>
              </div>

              {progress && (
                <div className="mb-4 p-3 rounded-xl bg-blue-950/40 border border-blue-800/30 fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {!progress.done && !progress.stopped ? <Loader2 size={14} className="spin text-blue-400" /> :
                        progress.stopped ? <StopCircle size={14} className="text-orange-400" /> :
                        <CheckCircle2 size={14} className="text-green-400" />}
                      <span className="text-xs font-semibold">
                        {progress.stopped ? "Stopped" : progress.done ? "Complete" : "Scanning…"}
                      </span>
                    </div>
                    <span className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                      {progress.completed.toLocaleString()} / {progress.total.toLocaleString()} · {progressPct}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
                    <div className={`h-full rounded-full transition-all duration-300 ${progress.stopped ? "bg-orange-500" : "bg-blue-500"}`} style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <MiniStat label="KonsoleH" value={progress.konsolehFound} color="text-emerald-400" />
                    <MiniStat label="cPanel" value={progress.cpanelFound} color="text-blue-400" />
                    <MiniStat label="Skipped" value={progress.skipped} color="text-yellow-400" />
                  </div>
                  {progress.currentEmail && !progress.done && (
                    <div className="text-xs font-mono truncate" style={{ color: "var(--muted)" }}>→ {progress.currentEmail}</div>
                  )}
                  {!progress.done && !progress.stopped && (
                    <button onClick={stopVerification}
                      className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 text-xs transition w-full justify-center">
                      <StopCircle size={13} /> Stop Scan
                    </button>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <label className="flex-1 cursor-pointer">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-600 transition">
                    <Upload size={14} />
                    <span className="text-xs truncate" style={{ color: "var(--muted)" }}>{file ? file.name : "Upload .txt or .csv"}</span>
                  </div>
                  <input ref={fileInputRef} type="file" accept=".txt,.csv" onChange={handleFileUpload} className="hidden" />
                </label>
                <button onClick={handleVerify} disabled={verifying || emailCount === 0}
                  className="px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition flex items-center gap-2 text-sm">
                  {verifying ? <><Loader2 size={15} className="spin" /> Scanning</> : <><Play size={15} /> Start Scan</>}
                </button>
              </div>
            </div>

            {/* Live feed */}
            <div className="lg:col-span-2 glass rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2">
                  <Activity size={15} className={verifying ? "text-green-400 animate-pulse" : ""} />
                  Live Feed {verifying && <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/30 text-green-400">LIVE</span>}
                </h2>
                <button onClick={() => setShowLive(!showLive)} style={{ color: "var(--muted)" }}>
                  {showLive ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {showLive && (
                <div className="space-y-1.5 max-h-[460px] overflow-y-auto">
                  {(verifying ? liveResults : allResults.slice(0, 25)).length === 0 ? (
                    <div className="text-center py-20" style={{ color: "var(--muted)" }}>
                      <Zap size={32} className="mx-auto mb-3 opacity-20" />
                      <p className="text-xs">Results appear here during scan</p>
                    </div>
                  ) : (verifying ? liveResults : allResults.slice(0, 25)).map(r => (
                    <LiveRow key={r.id} result={r} onCopy={copyToClipboard} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── RESULTS TAB — grouped by provider ── */}
        {tab === "results" && (
          <div className="fade-in space-y-4">
            {/* Toolbar */}
            <div className="glass rounded-xl p-4 flex flex-wrap items-center gap-3">
              {/* Provider filter dropdown */}
              <div className="relative">
                <button onClick={() => setShowProviderMenu(!showProviderMenu)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition text-sm">
                  <Filter size={13} />
                  <span className="max-w-32 truncate">{activeProviderName}</span>
                  <ChevronDown size={12} />
                </button>
                {showProviderMenu && (
                  <div className="absolute left-0 top-10 z-30 glass rounded-xl shadow-2xl py-1.5 w-56 fade-in max-h-72 overflow-y-auto">
                    <button onClick={() => { setSelectedProvider("all"); setShowProviderMenu(false); loadResults(1); }}
                      className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-700 transition ${selectedProvider === "all" ? "text-blue-400 font-semibold" : ""}`}>
                      All Providers ({totalResults.toLocaleString()})
                    </button>
                    <div className="border-t border-gray-700 my-1" />
                    {stats?.providerBreakdown.map(p => (
                      <button key={p.slug} onClick={() => { setSelectedProvider(p.slug || ""); setShowProviderMenu(false); loadResults(1); }}
                        className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-700 transition flex items-center justify-between ${selectedProvider === p.slug ? "text-blue-400 font-semibold" : ""}`}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${badgeClass(p.slug).split(" ")[0].replace("bg-", "bg-").replace("/40", "")}`} />
                          <span className="truncate max-w-36">{p.name || "Unknown"}</span>
                        </div>
                        <span style={{ color: "var(--muted)" }}>{p.count}</span>
                      </button>
                    ))}
                    {/* Unknown */}
                    <button onClick={() => { setSelectedProvider("__none__"); setShowProviderMenu(false); loadResults(1); }}
                      className={`w-full text-left px-4 py-2 text-xs hover:bg-gray-700 transition ${selectedProvider === "__none__" ? "text-blue-400 font-semibold" : ""}`}
                      style={{ color: "var(--muted)" }}>
                      Unknown / Undetected
                    </button>
                  </div>
                )}
              </div>

              {/* Search */}
              <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 min-w-40">
                <Search size={13} style={{ color: "var(--muted)" }} />
                <input type="text" placeholder="Search email or domain…" value={search}
                  onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                  className="bg-transparent outline-none flex-1 text-xs" />
                {search && <button onClick={() => setSearch("")}><X size={12} /></button>}
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <button onClick={() => loadResults(1)} className="p-2 rounded-lg hover:bg-gray-800 transition" title="Refresh"><RefreshCw size={14} /></button>

                {/* Download All menu */}
                <div className="relative">
                  <button onClick={() => setShowExportAllMenu(!showExportAllMenu)} disabled={allResults.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 transition text-xs font-medium">
                    <Download size={13} /> Download All <ChevronDown size={11} />
                  </button>
                  {showExportAllMenu && (
                    <div className="absolute right-0 top-10 z-30 glass rounded-xl shadow-2xl py-1.5 w-56 fade-in">
                      <div className="px-4 py-1 text-xs font-semibold" style={{ color: "var(--muted)" }}>Download All Results</div>
                      {[
                        { label: "All emails — grouped by host (.txt)", fmt: "grouped-txt" },
                        { label: "All emails plain list (.txt)", fmt: "txt" },
                        { label: "Full spreadsheet (.csv)", fmt: "csv" },
                        { label: "Full data (.json)", fmt: "json" },
                      ].map(({ label, fmt }) => (
                        <button key={fmt} onClick={() => downloadAll(fmt as any)}
                          className="w-full text-left px-4 py-2 text-xs hover:bg-gray-700 transition flex items-center gap-2">
                          <FileText size={13} /> {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={clearAll} disabled={allResults.length === 0}
                  className="p-2 rounded-lg bg-red-900/20 hover:bg-red-900/40 disabled:opacity-50 transition text-red-400" title="Clear all">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Grouped results */}
            {allResults.length === 0 ? (
              <div className="glass rounded-xl p-16 text-center" style={{ color: "var(--muted)" }}>
                <Database size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">No results yet</p>
                <p className="text-xs mt-1">Run a scan from the Scan tab</p>
              </div>
            ) : selectedProvider !== "all" ? (
              /* Single provider view */
              <ProviderGroup
                slug={selectedProvider === "__none__" ? null : selectedProvider}
                name={activeProviderName}
                panel={stats?.providerBreakdown.find(p => p.slug === selectedProvider)?.panel || null}
                emails={allResults}
                expandedId={expandedId}
                onToggle={id => setExpandedId(expandedId === id ? null : id)}
                onDelete={deleteEntry}
                onCopy={copyToClipboard}
                onDownload={(fmt) => downloadProviderGroup(selectedProvider === "__none__" ? null : selectedProvider, activeProviderName, allResults, fmt)}
                hasMore={hasMore}
                total={totalResults}
                onLoadMore={() => loadResults(currentPage + 1)}
              />
            ) : (
              /* All providers grouped */
              <>
                {[...Array.from(providerGroups.entries())].map(([key, group]) => (
                  <ProviderGroup
                    key={key}
                    slug={group.slug}
                    name={group.name || "Unknown / Undetected"}
                    panel={group.panel}
                    emails={group.emails}
                    expandedId={expandedId}
                    onToggle={id => setExpandedId(expandedId === id ? null : id)}
                    onDelete={deleteEntry}
                    onCopy={copyToClipboard}
                    onDownload={(fmt) => downloadProviderGroup(group.slug, group.name, group.emails, fmt)}
                  />
                ))}
                {hasMore && (
                  <button onClick={() => loadResults(currentPage + 1)}
                    className="w-full py-3 rounded-xl glass hover:bg-gray-800 transition text-xs" style={{ color: "var(--muted)" }}>
                    Load more ({totalResults - allResults.length} remaining)
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── ANALYTICS TAB ── */}
        {tab === "analytics" && stats && (
          <div className="fade-in space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard icon={<Mail size={18} className="text-blue-400" />} label="Total Scanned" value={stats.total.toLocaleString()} />
              <StatCard icon={<Server size={18} className="text-emerald-400" />} label="KonsoleH / xneelo" value={stats.konsolehCount.toLocaleString()} subtitle={`${stats.konsolehPercentage}%`} />
              <StatCard icon={<Globe size={18} className="text-blue-400" />} label="cPanel Hosts" value={stats.cpanelCount.toLocaleString()} subtitle={`${stats.cpanelPercentage}%`} />
              <StatCard icon={<TrendingUp size={18} className="text-purple-400" />} label="Sessions" value={stats.sessions.length.toLocaleString()} />
            </div>

            <div className="grid md:grid-cols-3 gap-5">
              {/* Provider breakdown with download buttons */}
              <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Shield size={15} /> By Hosting Provider</h3>
                <div className="space-y-2">
                  {stats.providerBreakdown.length === 0 ? (
                    <p className="text-xs text-center py-8" style={{ color: "var(--muted)" }}>No data yet</p>
                  ) : stats.providerBreakdown.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-1 border-b border-gray-800 last:border-0">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`px-2 py-0.5 rounded-full border text-xs truncate max-w-28 ${badgeClass(p.slug)}`}>{p.name || "Unknown"}</span>
                        {p.panel && <span className="text-xs opacity-50">{p.panel}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs font-semibold">{p.count}</span>
                        <button
                          onClick={() => { setSelectedProvider(p.slug || ""); setTab("results"); loadResults(1); }}
                          className="p-1 rounded hover:bg-gray-700 transition text-blue-400" title="View this group">
                          <ChevronRight size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top domains */}
              <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Globe size={15} /> Top Domains</h3>
                <div className="space-y-2">
                  {stats.topDomains.map((d, i) => (
                    <div key={d.domain}>
                      <div className="flex items-center justify-between text-xs mb-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 text-center font-bold opacity-40">{i + 1}</span>
                          <span className="font-mono truncate max-w-32">{d.domain}</span>
                          {d.provider && <span className={`px-1.5 py-0.5 rounded text-xs border ${badgeClass(null)}`}>{d.provider}</span>}
                        </div>
                        <span style={{ color: "var(--muted)" }}>{d.total}</span>
                      </div>
                      <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden ml-6">
                        <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min((d.total / (stats.topDomains[0]?.total || 1)) * 100, 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sessions */}
              <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Clock size={15} /> Scan Sessions</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {stats.sessions.length === 0 ? (
                    <p className="text-xs text-center py-8" style={{ color: "var(--muted)" }}>No sessions yet</p>
                  ) : stats.sessions.map(s => (
                    <div key={s.id} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <button onClick={() => { setSelectedSession(s.id); setTab("results"); loadResults(1); }}
                            className="text-xs font-medium hover:text-blue-400 transition text-left truncate block w-full">{s.name}</button>
                          <div className="flex gap-2 mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                            <span>{s.totalCount} scanned</span>
                            {s.konsolehCount > 0 && <span className="text-emerald-400">{s.konsolehCount} KH</span>}
                            {s.cpanelCount > 0 && <span className="text-blue-400">{s.cpanelCount} cPanel</span>}
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{new Date(s.createdAt).toLocaleString()}</div>
                        </div>
                        <button onClick={() => deleteSession(s.id)} className="p-1 rounded hover:bg-red-900/30 text-red-500 shrink-0"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ─────────── Provider Group Component ───────────
function ProviderGroup({ slug, name, panel, emails, expandedId, onToggle, onDelete, onCopy, onDownload, hasMore, total, onLoadMore }: {
  slug: string | null; name: string; panel: string | null;
  emails: EmailEntry[]; expandedId: string | null;
  onToggle: (id: string) => void; onDelete: (id: string) => void;
  onCopy: (t: string) => void; onDownload: (fmt: "txt" | "csv") => void;
  hasMore?: boolean; total?: number; onLoadMore?: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showDlMenu, setShowDlMenu] = useState(false);

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Group header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700/50 bg-gray-800/30">
        <button onClick={() => setCollapsed(!collapsed)} className="flex items-center gap-2 flex-1 min-w-0">
          <ChevronRight size={14} className={`shrink-0 transition-transform ${collapsed ? "" : "rotate-90"}`} style={{ color: "var(--muted)" }} />
          <span className={`px-2.5 py-1 rounded-full border text-xs font-semibold ${badgeClass(slug)}`}>{name}</span>
          {panel && <span className="text-xs opacity-50 hidden sm:block">{panel}</span>}
          <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>{emails.length.toLocaleString()} emails</span>
        </button>

        {/* Per-group download */}
        <div className="relative shrink-0">
          <button onClick={() => setShowDlMenu(!showDlMenu)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 transition text-xs">
            <Download size={12} /> Download <ChevronDown size={10} />
          </button>
          {showDlMenu && (
            <div className="absolute right-0 top-9 z-30 glass rounded-xl shadow-2xl py-1.5 w-48 fade-in">
              <button onClick={() => { onDownload("txt"); setShowDlMenu(false); }}
                className="w-full text-left px-4 py-2 text-xs hover:bg-gray-700 transition flex items-center gap-2">
                <FileText size={12} /> Email list (.txt)
              </button>
              <button onClick={() => { onDownload("csv"); setShowDlMenu(false); }}
                className="w-full text-left px-4 py-2 text-xs hover:bg-gray-700 transition flex items-center gap-2">
                <FileText size={12} /> Full details (.csv)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rows */}
      {!collapsed && (
        <div className="divide-y divide-gray-700/30">
          {emails.map(r => (
            <ResultRow key={r.id} result={r} expanded={expandedId === r.id}
              onToggle={() => onToggle(r.id)} onDelete={() => onDelete(r.id)} onCopy={onCopy} />
          ))}
          {hasMore && onLoadMore && (
            <button onClick={onLoadMore}
              className="w-full py-2.5 text-xs hover:bg-gray-800 transition" style={{ color: "var(--muted)" }}>
              Load more ({(total || 0) - emails.length} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────── Result Row ───────────
function ResultRow({ result, expanded, onToggle, onDelete, onCopy }: {
  result: EmailEntry; expanded: boolean;
  onToggle: () => void; onDelete: () => void; onCopy: (t: string) => void;
}) {
  return (
    <div className={`transition ${expanded ? "bg-gray-800/20" : "hover:bg-gray-800/20"}`}>
      <div className="flex items-center gap-2 px-4 py-2 cursor-pointer" onClick={onToggle}>
        <ChevronRight size={12} className={`shrink-0 transition-transform opacity-40 ${expanded ? "rotate-90" : ""}`} />
        <div className="flex-1 min-w-0">
          <span className="font-mono text-xs truncate block">{result.email}</span>
          {result.detectionMethod && result.detectionMethod !== "none" && (
            <span className="text-xs opacity-40">via {result.detectionMethod} · {result.confidence}</span>
          )}
        </div>
        {!result.domainExists && <span className="text-xs text-red-400 shrink-0">No domain</span>}
        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <button onClick={() => onCopy(result.email)} className="p-1 rounded hover:bg-gray-700 transition opacity-50 hover:opacity-100"><Copy size={11} /></button>
          <button onClick={onDelete} className="p-1 rounded hover:bg-red-900/30 transition text-red-500 opacity-50 hover:opacity-100"><Trash2 size={11} /></button>
        </div>
      </div>
      {expanded && (
        <div className="px-6 pb-3 fade-in">
          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs mb-2">
            <InfoRow label="Domain" value={result.domain} />
            <InfoRow label="IP" value={result.aRecord || "—"} />
            <InfoRow label="Panel" value={result.providerPanel || "—"} />
            <InfoRow label="Country" value={result.providerCountry || "—"} />
            <InfoRow label="Detection" value={result.detectionMethod || "—"} />
            <InfoRow label="Confidence" value={result.confidence || "—"} />
            {result.notes && <InfoRow label="Note" value={result.notes} />}
          </div>
          {result.nsRecords?.length > 0 && (
            <div className="mb-1.5">
              <span className="text-xs font-semibold opacity-50">NS: </span>
              <span className="font-mono text-xs">{result.nsRecords.join(" · ")}</span>
            </div>
          )}
          {result.mxRecords?.length > 0 && (
            <div>
              <span className="text-xs font-semibold opacity-50">MX: </span>
              <span className="font-mono text-xs">{result.mxRecords.join(" · ")}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LiveRow({ result, onCopy }: { result: EmailEntry; onCopy: (t: string) => void }) {
  return (
    <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs group ${result.isKonsoleh ? "bg-emerald-950/30 border border-emerald-900/30" : result.isCpanel ? "bg-blue-950/20 border border-blue-900/20" : "bg-gray-800/30"}`}>
      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${result.isKonsoleh ? "bg-emerald-400" : result.isCpanel ? "bg-blue-400" : result.domainExists ? "bg-gray-500" : "bg-red-500"}`} />
      <span className="font-mono truncate flex-1">{result.email}</span>
      {result.providerName && <span className={`px-1.5 py-0.5 rounded border text-xs shrink-0 ${badgeClass(result.providerSlug)}`}>{result.providerName.split(" ")[0]}</span>}
      <button onClick={() => onCopy(result.email)} className="opacity-0 group-hover:opacity-100 transition"><Copy size={11} style={{ color: "var(--muted)" }} /></button>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <div><span style={{ color: "var(--muted)" }}>{label}: </span><span className="font-medium">{value}</span></div>;
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-1.5 rounded-lg bg-gray-900/40">
      <div className={`text-base font-bold ${color}`}>{value}</div>
      <div className="text-xs" style={{ color: "var(--muted)" }}>{label}</div>
    </div>
  );
}

function StatCard({ icon, label, value, subtitle }: { icon: React.ReactNode; label: string; value: string; subtitle?: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs" style={{ color: "var(--muted)" }}>{label}</span></div>
      <div className="text-2xl font-bold">{value}</div>
      {subtitle && <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{subtitle}</div>}
    </div>
  );
}



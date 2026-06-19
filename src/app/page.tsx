"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Upload, CheckCircle2, XCircle, Server, Mail, Loader2,
  Search, Filter, Download, Trash2, BarChart3, RefreshCw,
  LogOut, FileText, Clock, ChevronDown, X, AlertCircle
} from "lucide-react";

interface EmailResult {
  id: string;
  email: string;
  domain: string;
  isKonsoleh: boolean;
  konsolehServer: string | null;
  smtpVerified: boolean;
  mxRecords: string[];
  formatValid: boolean;
  domainExists: boolean;
  notes: string | null;
  sessionId: string | null;
}

interface Session {
  id: string;
  name: string;
  totalCount: number;
  konsolehCount: number;
  validCount: number;
  createdAt: string;
}

interface Stats {
  total: number;
  konsolehCount: number;
  validCount: number;
  konsolehPercentage: string;
  topDomains: Array<{ domain: string; total: number; konsoleh: number }>;
  sessions: Session[];
}

interface Progress {
  completed: number;
  total: number;
  done: boolean;
}

export default function Home() {
  const router = useRouter();
  const [emails, setEmails] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [results, setResults] = useState<EmailResult[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState<"all" | "konsoleh">("all");
  const [search, setSearch] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [selectedSession, setSelectedSession] = useState<string>("");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [notification, setNotification] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    loadResults();
  }, [filter, search, selectedSession]);

  async function checkAuth() {
    const res = await fetch("/api/auth/me");
    if (res.status === 401) router.push("/login");
    else { loadResults(); loadStats(); }
  }

  function notify(msg: string, type: "success" | "error" = "success") {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  }

  async function loadResults() {
    try {
      const params = new URLSearchParams();
      if (filter === "konsoleh") params.set("konsolehOnly", "true");
      if (search) params.set("search", search);
      if (selectedSession) params.set("sessionId", selectedSession);
      params.set("limit", "200");
      const res = await fetch(`/api/results?${params}`);
      if (res.status === 401) { router.push("/login"); return; }
      const data = await res.json();
      setResults(data.results || []);
    } catch (err) { console.error(err); }
  }

  async function loadStats() {
    try {
      const res = await fetch("/api/stats");
      if (res.status === 401) return;
      const data = await res.json();
      setStats(data);
    } catch (err) { console.error(err); }
  }

  async function handleVerify() {
    const emailList = emails
      .split(/[\n,;]/)
      .map((e) => e.trim())
      .filter((e) => e.includes("@"));

    if (emailList.length === 0) { notify("Please enter at least one email address", "error"); return; }

    setVerifying(true);
    const progressId = Math.random().toString(36).slice(2);
    setProgress({ completed: 0, total: emailList.length, done: false });

    // Poll progress
    progressInterval.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/progress?id=${progressId}`);
        const p = await res.json();
        setProgress(p);
        if (p.done) {
          if (progressInterval.current) clearInterval(progressInterval.current);
        }
      } catch {}
    }, 800);

    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: emailList,
          sessionName: sessionName || `Session ${new Date().toLocaleString()}`,
          progressId,
        }),
      });

      const data = await res.json();
      if (progressInterval.current) clearInterval(progressInterval.current);

      if (data.success) {
        notify(`✓ Verified ${data.total} emails — KonsoleH: ${data.konsolehCount}, SMTP Valid: ${data.validCount}`);
        setEmails("");
        setSessionName("");
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        await loadResults();
        await loadStats();
      } else {
        notify(data.error || "Verification failed", "error");
      }
    } catch (err: any) {
      if (progressInterval.current) clearInterval(progressInterval.current);
      notify(err?.message || "Network error", "error");
    } finally {
      setVerifying(false);
      setTimeout(() => setProgress(null), 2000);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;
    setFile(uploadedFile);
    const reader = new FileReader();
    reader.onload = (evt) => setEmails(evt.target?.result as string);
    reader.readAsText(uploadedFile);
  }

  async function deleteEntry(id: string) {
    try {
      await fetch(`/api/results?id=${id}`, { method: "DELETE" });
      setResults(prev => prev.filter(r => r.id !== id));
      notify("Entry deleted");
    } catch { notify("Error deleting entry", "error"); }
  }

  async function deleteSession(sessionId: string) {
    if (!confirm("Delete this session and all its entries?")) return;
    try {
      await fetch(`/api/results?sessionId=${sessionId}`, { method: "DELETE" });
      setSelectedSession("");
      await loadResults();
      await loadStats();
      notify("Session deleted");
    } catch { notify("Error deleting session", "error"); }
  }

  async function clearAll() {
    if (!confirm("Delete ALL verification data? This cannot be undone.")) return;
    try {
      await fetch("/api/results", { method: "DELETE" });
      await loadResults();
      await loadStats();
      notify("All data cleared");
    } catch { notify("Error clearing data", "error"); }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  function exportData(format: "csv" | "txt" | "json" | "konsoleh-only-txt") {
    setShowExportMenu(false);
    const filtered = format === "konsoleh-only-txt"
      ? results.filter(r => r.isKonsoleh)
      : results;

    let content = "";
    let filename = `konsoleh-verification-${Date.now()}`;
    let mime = "text/plain";

    if (format === "csv") {
      content = [
        ["Email", "Domain", "KonsoleH Hosted", "KonsoleH Server", "SMTP Valid", "Domain Exists", "MX Records", "Notes"].join(","),
        ...filtered.map(r => [
          r.email, r.domain,
          r.isKonsoleh ? "Yes" : "No",
          r.konsolehServer || "-",
          r.smtpVerified ? "Yes" : "No",
          r.domainExists ? "Yes" : "No",
          (r.mxRecords || []).join("; "),
          r.notes || "",
        ].join(","))
      ].join("\n");
      filename += ".csv";
      mime = "text/csv";
    } else if (format === "txt") {
      content = filtered.map(r =>
        `${r.email} | ${r.isKonsoleh ? "KonsoleH" : "Not KonsoleH"} | SMTP: ${r.smtpVerified ? "Valid" : "Invalid"} | ${r.konsolehServer || r.domain}`
      ).join("\n");
      filename += ".txt";
    } else if (format === "konsoleh-only-txt") {
      content = filtered.map(r => r.email).join("\n");
      filename += "-konsoleh-emails.txt";
    } else if (format === "json") {
      content = JSON.stringify(filtered, null, 2);
      filename += ".json";
      mime = "application/json";
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const filteredResults = results.filter(r => {
    if (filter === "konsoleh" && !r.isKonsoleh) return false;
    if (search && !r.email.toLowerCase().includes(search.toLowerCase()) &&
        !r.domain.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const progressPct = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  return (
    <main className="min-h-screen p-4 md:p-8" style={{ background: "var(--bg)" }}>
      {/* Notification */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium fade-in flex items-center gap-2 ${
          notification.type === "error" ? "bg-red-900/90 border border-red-700 text-red-200" : "bg-green-900/90 border border-green-700 text-green-200"
        }`}>
          {notification.type === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {notification.msg}
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <Server size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">KonsoleH Verifier</h1>
              <p className="text-xs" style={{ color: "var(--muted)" }}>Detect konsoleH.co.za / xneelo hosting</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition text-sm"
            style={{ color: "var(--muted)" }}
          >
            <LogOut size={16} /> Logout
          </button>
        </div>

        {/* Stats Bar */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5 fade-in">
            <StatCard icon={<Mail size={18} className="text-blue-400" />} label="Total Verified" value={stats.total.toLocaleString()} />
            <StatCard icon={<Server size={18} className="text-green-400" />} label="KonsoleH" value={stats.konsolehCount.toLocaleString()} subtitle={`${stats.konsolehPercentage}%`} />
            <StatCard icon={<CheckCircle2 size={18} className="text-emerald-400" />} label="SMTP Valid" value={stats.validCount.toLocaleString()} />
            <button onClick={() => setShowStats(!showStats)} className="glass rounded-xl p-4 hover:bg-gray-800 transition text-left">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 size={18} className="text-purple-400" />
                <span className="text-xs" style={{ color: "var(--muted)" }}>Analytics</span>
              </div>
              <div className="text-lg font-bold">{showStats ? "Hide" : "View"}</div>
            </button>
          </div>
        )}

        {/* Analytics Panel */}
        {showStats && stats && (
          <div className="glass rounded-xl p-5 mb-5 fade-in">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Top Domains */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 size={16} /> Top Domains
                </h3>
                <div className="space-y-1.5">
                  {stats.topDomains.map((d) => (
                    <div key={d.domain} className="flex items-center justify-between py-1.5 border-b border-gray-800 text-sm">
                      <span className="font-mono text-xs">{d.domain}</span>
                      <div className="flex items-center gap-3 text-xs">
                        <span style={{ color: "var(--muted)" }}>{d.total} total</span>
                        {d.konsoleh > 0 && <span className="text-green-400 font-semibold">KH: {d.konsoleh}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Sessions */}
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Clock size={16} /> Recent Sessions
                </h3>
                <div className="space-y-1.5">
                  {stats.sessions.map((s) => (
                    <div key={s.id} className="flex items-center justify-between py-1.5 border-b border-gray-800">
                      <div>
                        <button
                          onClick={() => { setSelectedSession(s.id === selectedSession ? "" : s.id); setShowStats(false); }}
                          className="text-xs font-medium hover:text-blue-400 transition text-left"
                        >
                          {s.name}
                        </button>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {s.totalCount} emails · {s.konsolehCount} KH
                        </div>
                      </div>
                      <button
                        onClick={() => deleteSession(s.id)}
                        className="p-1 rounded hover:bg-red-900/30 transition"
                        style={{ color: "var(--muted)" }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                  {stats.sessions.length === 0 && (
                    <p className="text-xs" style={{ color: "var(--muted)" }}>No sessions yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Session filter badge */}
        {selectedSession && stats && (
          <div className="flex items-center gap-2 mb-4 fade-in">
            <span className="text-xs px-3 py-1.5 rounded-full bg-blue-900/30 border border-blue-800/30 text-blue-400 flex items-center gap-2">
              <Filter size={12} />
              Filtering by: {stats.sessions.find(s => s.id === selectedSession)?.name || "Session"}
              <button onClick={() => setSelectedSession("")} className="hover:text-white transition">
                <X size={12} />
              </button>
            </span>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-5">
          {/* Input Panel */}
          <div className="glass rounded-xl p-5 fade-in">
            <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
              <Upload size={18} /> Verify Emails
            </h2>

            <input
              type="text"
              placeholder="Session name (optional)"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg mb-3 bg-gray-800 border border-gray-700 outline-none focus:border-blue-500 transition text-sm"
            />

            <textarea
              placeholder={"Enter emails (one per line, comma or semicolon separated)\n\nExample:\nuser1@example.co.za\nuser2@company.com\nadmin@business.co.za\n\nNo limit — paste as many as you need."}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              className="w-full h-56 px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 outline-none focus:border-blue-500 transition font-mono text-xs resize-none"
            />

            {/* Email count */}
            {emails.trim() && (
              <div className="text-xs mt-1 mb-3" style={{ color: "var(--muted)" }}>
                {emails.split(/[\n,;]/).filter(e => e.trim().includes("@")).length.toLocaleString()} emails detected
              </div>
            )}

            {/* Progress Bar */}
            {progress && (
              <div className="mb-3 fade-in">
                <div className="flex items-center justify-between text-xs mb-1.5" style={{ color: "var(--muted)" }}>
                  <span>Verifying... {progress.completed.toLocaleString()} / {progress.total.toLocaleString()}</span>
                  <span>{progressPct}%</span>
                </div>
                <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 mt-1">
              <label className="flex-1 cursor-pointer">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 hover:border-gray-600 transition text-sm">
                  <Upload size={14} />
                  <span className="text-xs truncate">{file ? file.name : "Upload .txt or .csv"}</span>
                </div>
                <input ref={fileInputRef} type="file" accept=".txt,.csv" onChange={handleFileUpload} className="hidden" />
              </label>

              <button
                onClick={handleVerify}
                disabled={verifying || !emails.trim()}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-semibold transition flex items-center gap-2 text-sm"
              >
                {verifying ? <><Loader2 size={16} className="spin" /> Verifying</> : <><CheckCircle2 size={16} /> Verify</>}
              </button>
            </div>

            <div className="mt-3 p-3 rounded-lg bg-blue-900/20 border border-blue-800/30">
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                <strong className="text-blue-400">Detection:</strong> Checks MX records for konsoleH.co.za, xneelo.com, your-server.de, hetzner.co.za patterns. Performs DNS + SMTP verification. No email limit.
              </p>
            </div>
          </div>

          {/* Results Panel */}
          <div className="glass rounded-xl p-5 fade-in">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Mail size={18} /> Results ({filteredResults.length.toLocaleString()})
              </h2>
              <div className="flex items-center gap-1.5">
                <button onClick={loadResults} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition" title="Refresh">
                  <RefreshCw size={14} />
                </button>

                {/* Export Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowExportMenu(!showExportMenu)}
                    disabled={results.length === 0}
                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-50 transition flex items-center gap-1"
                    title="Export"
                  >
                    <Download size={14} />
                    <ChevronDown size={12} />
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 top-8 z-20 glass rounded-lg shadow-xl py-1 w-48 fade-in">
                      {[
                        { label: "Export as CSV", fmt: "csv" as const },
                        { label: "Export as TXT", fmt: "txt" as const },
                        { label: "Export as JSON", fmt: "json" as const },
                        { label: "KonsoleH emails only (.txt)", fmt: "konsoleh-only-txt" as const },
                      ].map(({ label, fmt }) => (
                        <button key={fmt} onClick={() => exportData(fmt)} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-700 transition flex items-center gap-2">
                          <FileText size={14} /> {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={clearAll}
                  disabled={results.length === 0}
                  className="p-1.5 rounded-lg bg-red-900/30 hover:bg-red-900/50 disabled:opacity-50 transition"
                  title="Clear all"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex items-center gap-1 rounded-lg bg-gray-800 p-1">
                <button
                  onClick={() => setFilter("all")}
                  className={`px-3 py-1 rounded text-xs transition ${filter === "all" ? "bg-blue-600" : "hover:bg-gray-700"}`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilter("konsoleh")}
                  className={`px-3 py-1 rounded text-xs transition flex items-center gap-1 ${filter === "konsoleh" ? "bg-green-600" : "hover:bg-gray-700"}`}
                >
                  <Server size={12} /> KonsoleH
                </button>
              </div>
              <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800">
                <Search size={14} style={{ color: "var(--muted)" }} />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent outline-none flex-1 text-xs"
                />
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {filteredResults.length === 0 ? (
                <div className="text-center py-16" style={{ color: "var(--muted)" }}>
                  <Mail size={36} className="mx-auto mb-3 opacity-20" />
                  <p className="text-sm">No results yet.</p>
                </div>
              ) : (
                filteredResults.map((result) => (
                  <div key={result.id} className="p-2.5 rounded-lg bg-gray-800/50 border border-gray-700 hover:border-gray-600 transition group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs mb-1 truncate">{result.email}</div>
                        <div className="flex items-center gap-1.5 flex-wrap text-xs">
                          <span style={{ color: "var(--muted)" }}>{result.domain}</span>
                          {result.isKonsoleh && (
                            <span className="px-1.5 py-0.5 rounded-full bg-green-900/30 text-green-400 font-semibold flex items-center gap-1 text-xs">
                              <Server size={10} /> KonsoleH
                            </span>
                          )}
                          {result.smtpVerified && (
                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 text-xs">SMTP ✓</span>
                          )}
                        </div>
                        {result.konsolehServer && (
                          <div className="text-xs mt-0.5 font-mono" style={{ color: "var(--muted)" }}>
                            {result.konsolehServer}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {result.domainExists ? <CheckCircle2 size={16} className="text-green-500" /> : <XCircle size={16} className="text-red-500" />}
                        <button
                          onClick={() => deleteEntry(result.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-900/30 transition"
                          style={{ color: "var(--muted)" }}
                          title="Delete entry"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function StatCard({ icon, label, value, subtitle }: {
  icon: React.ReactNode; label: string; value: string; subtitle?: string;
}) {
  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs" style={{ color: "var(--muted)" }}>{label}</span>
      </div>
      <div className="text-xl font-bold">{value}</div>
      {subtitle && <div className="text-xs" style={{ color: "var(--muted)" }}>{subtitle}</div>}
    </div>
  );
}

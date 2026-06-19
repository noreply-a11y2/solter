import { promises as dns } from "dns";

// ─────────────────────────────────────────────────────────────
// HOSTING FINGERPRINT DATABASE
// Detection priority: NS records > MX records > Reverse DNS
// ─────────────────────────────────────────────────────────────

export interface HostingProvider {
  name: string;
  slug: string;           // machine-readable ID
  panel: string;          // cPanel, KonsoleH, Plesk, DirectAdmin, etc.
  country: string;
  color: string;          // for UI badge
}

interface HostPattern {
  provider: HostingProvider;
  patterns: RegExp[];
}

// Known SA + global cPanel/webmail hosting providers
const PROVIDERS: Record<string, HostingProvider> = {
  konsoleh: { name: "KonsoleH / xneelo", slug: "konsoleh", panel: "KonsoleH", country: "ZA", color: "green" },
  afrihost: { name: "Afrihost", slug: "afrihost", panel: "cPanel", country: "ZA", color: "blue" },
  "1grid": { name: "1-Grid", slug: "1grid", panel: "cPanel", country: "ZA", color: "orange" },
  elitehost: { name: "Elitehost", slug: "elitehost", panel: "cPanel", country: "ZA", color: "purple" },
  hostafrica: { name: "HostAfrica", slug: "hostafrica", panel: "cPanel", country: "ZA", color: "red" },
  cybersmart: { name: "Cybersmart", slug: "cybersmart", panel: "cPanel", country: "ZA", color: "cyan" },
  domains_co_za: { name: "Domains.co.za", slug: "domains_co_za", panel: "cPanel", country: "ZA", color: "teal" },
  webafrica: { name: "Webafrica", slug: "webafrica", panel: "cPanel", country: "ZA", color: "yellow" },
  rsaweb: { name: "RSAWEB", slug: "rsaweb", panel: "cPanel", country: "ZA", color: "indigo" },
  absolute: { name: "Absolute Hosting", slug: "absolute", panel: "cPanel", country: "ZA", color: "pink" },
  cloudafrica: { name: "CloudAfrica", slug: "cloudafrica", panel: "cPanel", country: "ZA", color: "sky" },
  ionos: { name: "IONOS / 1&1", slug: "ionos", panel: "Plesk", country: "DE", color: "blue" },
  godaddy: { name: "GoDaddy", slug: "godaddy", panel: "cPanel", country: "US", color: "green" },
  namecheap: { name: "Namecheap", slug: "namecheap", panel: "cPanel", country: "US", color: "orange" },
  hostgator: { name: "HostGator", slug: "hostgator", panel: "cPanel", country: "US", color: "yellow" },
  bluehost: { name: "Bluehost", slug: "bluehost", panel: "cPanel", country: "US", color: "blue" },
  siteground: { name: "SiteGround", slug: "siteground", panel: "cPanel", country: "US", color: "orange" },
  cloudflare: { name: "Cloudflare", slug: "cloudflare", panel: "CDN/Proxy", country: "US", color: "orange" },
  google: { name: "Google Workspace", slug: "google", panel: "Google", country: "US", color: "blue" },
  microsoft: { name: "Microsoft 365", slug: "microsoft", panel: "Microsoft", country: "US", color: "blue" },
};

// NS record fingerprints (checked first — most reliable)
const NS_PATTERNS: HostPattern[] = [
  {
    provider: PROVIDERS.konsoleh,
    patterns: [
      /your-server\.de$/i,
      /second-ns\.(com|de)$/i,
      /xneelo\.(co\.za|com)$/i,
      /hetzner\.(co\.za|de)$/i,
      /konsoleh\.co\.za$/i,
      /host-h\.net$/i,
    ],
  },
  {
    provider: PROVIDERS.afrihost,
    patterns: [
      /afrihost\.com$/i,
      /afrihost\.co\.za$/i,
      /ns\d*\.afrihost\./i,
    ],
  },
  {
    provider: PROVIDERS["1grid"],
    patterns: [
      /1-grid\.(net|com|co\.za)$/i,
      /gridhost\.(com|co\.za)$/i,
      /1grid\.(net|com)$/i,
      /webafrica\.co\.za$/i,      // 1-grid was part of Webafrica
    ],
  },
  {
    provider: PROVIDERS.elitehost,
    patterns: [
      /elitehost\.(co\.za|net|com)$/i,
      /ns\d*\.elitehost\./i,
    ],
  },
  {
    provider: PROVIDERS.hostafrica,
    patterns: [
      /hostafrica\.(com|co\.za)$/i,
      /host-africa\.com$/i,
    ],
  },
  {
    provider: PROVIDERS.cybersmart,
    patterns: [
      /cybersmart\.(co\.za|net)$/i,
      /ns\d*\.cybersmart\./i,
    ],
  },
  {
    provider: PROVIDERS.domains_co_za,
    patterns: [
      /domains\.co\.za$/i,
      /ns\d*\.domains\.co\.za$/i,
    ],
  },
  {
    provider: PROVIDERS.webafrica,
    patterns: [
      /webafrica\.(co\.za|com)$/i,
    ],
  },
  {
    provider: PROVIDERS.rsaweb,
    patterns: [
      /rsaweb\.(co\.za|net|com)$/i,
    ],
  },
  {
    provider: PROVIDERS.absolute,
    patterns: [
      /absolutehosting\.(co\.za|com)$/i,
      /absolutedns\./i,
    ],
  },
  {
    provider: PROVIDERS.cloudafrica,
    patterns: [
      /cloudafrica\.(net|co\.za|com)$/i,
    ],
  },
  {
    provider: PROVIDERS.ionos,
    patterns: [
      /ionos\.(com|co\.uk|de)$/i,
      /1and1\.(com|org)$/i,
      /ui-dns\.(com|de|biz|org)$/i,
    ],
  },
  {
    provider: PROVIDERS.godaddy,
    patterns: [
      /domaincontrol\.com$/i,
      /godaddy\.com$/i,
    ],
  },
  {
    provider: PROVIDERS.namecheap,
    patterns: [
      /registrar-servers\.com$/i,
      /namecheaphosting\.com$/i,
      /web-hosting\.com$/i,
    ],
  },
  {
    provider: PROVIDERS.cloudflare,
    patterns: [
      /cloudflare\.com$/i,
      /ns\d*\.cloudflare\.com$/i,
    ],
  },
  {
    provider: PROVIDERS.hostgator,
    patterns: [
      /hostgator\.com$/i,
      /hgmo\.com$/i,
    ],
  },
  {
    provider: PROVIDERS.bluehost,
    patterns: [
      /bluehost\.com$/i,
      /ns\d*\.bluehost\.com$/i,
    ],
  },
  {
    provider: PROVIDERS.siteground,
    patterns: [
      /siteground\.(com|net|biz|org|info|us)$/i,
      /sgvps\.net$/i,
    ],
  },
];

// MX fingerprints (fallback if NS not matched)
const MX_PATTERNS: HostPattern[] = [
  {
    provider: PROVIDERS.konsoleh,
    patterns: [
      /\.your-server\.de$/i,
      /\.hetzner\.(co\.za|de)$/i,
      /\.xneelo\.(co\.za|com)$/i,
      /\.konsoleh\.co\.za$/i,
      /\.host-h\.net$/i,
    ],
  },
  {
    provider: PROVIDERS.afrihost,
    patterns: [/\.afrihost\.(com|co\.za)$/i],
  },
  {
    provider: PROVIDERS["1grid"],
    patterns: [/\.1-grid\.(net|com)$/i, /\.gridhost\.com$/i],
  },
  {
    provider: PROVIDERS.elitehost,
    patterns: [/\.elitehost\.(co\.za|net)$/i],
  },
  {
    provider: PROVIDERS.hostafrica,
    patterns: [/\.hostafrica\.(com|co\.za)$/i],
  },
  {
    provider: PROVIDERS.google,
    patterns: [/\.google(mail)?\.com$/i, /aspmx\.l\.google\.com$/i],
  },
  {
    provider: PROVIDERS.microsoft,
    patterns: [/\.outlook\.com$/i, /\.protection\.outlook\.com$/i, /\.mail\.protection\.outlook\.com$/i],
  },
  {
    provider: PROVIDERS.godaddy,
    patterns: [/\.secureserver\.net$/i, /\.emailsrvr\.com$/i],
  },
  {
    provider: PROVIDERS.ionos,
    patterns: [/\.ionos\.com$/i, /mx\d*\.ionos\./i],
  },
];

export interface VerificationResult {
  domain: string;
  domainExists: boolean;
  nsRecords: string[];
  mxRecords: string[];
  aRecord: string | null;
  provider: HostingProvider | null;
  detectionMethod: "NS" | "MX" | "reverse_dns" | "none";
  confidence: "high" | "medium" | "low";
  isKonsoleh: boolean;         // kept for backwards compat
  isCpanel: boolean;
  error?: string;
}

// Domain-level result (not per-email, since domain is what matters)
export interface DomainResult extends VerificationResult {
  emails: string[];            // all emails sharing this domain
}

// Per-email wrapper for DB storage
export interface EmailResult {
  email: string;
  domain: string;
  formatValid: boolean;
  domainResult: VerificationResult;
  error?: string;
}

export function validateEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function extractDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() || "";
}

function matchPatterns(value: string, patterns: HostPattern[]): { provider: HostingProvider; matched: string } | null {
  for (const hp of patterns) {
    for (const re of hp.patterns) {
      if (re.test(value)) return { provider: hp.provider, matched: value };
    }
  }
  return null;
}

const dnsCache = new Map<string, { result: VerificationResult; expires: number }>();

export async function verifyDomain(domain: string): Promise<VerificationResult> {
  const cached = dnsCache.get(domain);
  if (cached && cached.expires > Date.now()) return cached.result;

  const result: VerificationResult = {
    domain,
    domainExists: false,
    nsRecords: [],
    mxRecords: [],
    aRecord: null,
    provider: null,
    detectionMethod: "none",
    confidence: "low",
    isKonsoleh: false,
    isCpanel: false,
  };

  try {
    // 1. NS Records — highest confidence
    try {
      const ns = await dns.resolveNs(domain);
      result.nsRecords = ns;
      result.domainExists = true;

      for (const nsRecord of ns) {
        const match = matchPatterns(nsRecord.toLowerCase(), NS_PATTERNS);
        if (match) {
          result.provider = match.provider;
          result.detectionMethod = "NS";
          result.confidence = "high";
          break;
        }
      }
    } catch {
      // NS lookup failed — try other records
    }

    // 2. A Record (confirms domain existence)
    if (!result.domainExists) {
      try {
        const a = await dns.resolve4(domain);
        if (a.length > 0) {
          result.domainExists = true;
          result.aRecord = a[0];
        }
      } catch {}
    } else {
      try {
        const a = await dns.resolve4(domain);
        if (a.length > 0) result.aRecord = a[0];
      } catch {}
    }

    // 3. MX Records — medium confidence
    try {
      const mx = await dns.resolveMx(domain);
      result.mxRecords = mx.sort((a, b) => a.priority - b.priority).map(m => m.exchange);
      result.domainExists = true;

      if (!result.provider) {
        for (const mxRecord of result.mxRecords) {
          const match = matchPatterns(mxRecord.toLowerCase(), MX_PATTERNS);
          if (match) {
            result.provider = match.provider;
            result.detectionMethod = "MX";
            result.confidence = "medium";
            break;
          }
        }
      }
    } catch {}

    // 4. Reverse DNS on A record — low confidence fallback
    if (!result.provider && result.aRecord) {
      try {
        const hostnames = await dns.reverse(result.aRecord);
        for (const hostname of hostnames) {
          const match = matchPatterns(hostname.toLowerCase(), [...NS_PATTERNS, ...MX_PATTERNS]);
          if (match) {
            result.provider = match.provider;
            result.detectionMethod = "reverse_dns";
            result.confidence = "low";
            break;
          }
        }
      } catch {}
    }

    // Set convenience flags
    result.isKonsoleh = result.provider?.slug === "konsoleh";
    result.isCpanel = ["cPanel", "KonsoleH"].includes(result.provider?.panel || "");

  } catch (err: any) {
    result.error = err?.message || "DNS lookup failed";
  }

  dnsCache.set(domain, { result, expires: Date.now() + 600000 }); // 10 min cache
  return result;
}

export async function verifyEmailBatch(
  emails: string[],
  concurrency = 25,
  onProgress?: (completed: number, total: number, currentEmail: string, konsolehFound: number, cpanelFound: number) => boolean | void
): Promise<EmailResult[]> {
  const results: EmailResult[] = [];

  // Group by domain to avoid redundant DNS lookups
  const domainMap = new Map<string, string[]>();
  const invalidEmails: EmailResult[] = [];

  for (const raw of emails) {
    const email = raw.toLowerCase().trim();
    if (!validateEmailFormat(email)) {
      invalidEmails.push({ email, domain: "", formatValid: false, domainResult: {
        domain: "", domainExists: false, nsRecords: [], mxRecords: [], aRecord: null,
        provider: null, detectionMethod: "none", confidence: "low",
        isKonsoleh: false, isCpanel: false, error: "Invalid format"
      }});
      continue;
    }
    const domain = extractDomain(email);
    if (!domainMap.has(domain)) domainMap.set(domain, []);
    domainMap.get(domain)!.push(email);
  }

  const domains = Array.from(domainMap.keys());
  const queue = [...domains];
  let completed = 0;
  let konsolehFound = 0;
  let cpanelFound = 0;
  let shouldStop = false;

  const domainResults = new Map<string, VerificationResult>();

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0 && !shouldStop) {
      const domain = queue.shift();
      if (!domain) break;

      const domainResult = await verifyDomain(domain);
      domainResults.set(domain, domainResult);

      const domainEmails = domainMap.get(domain) || [];
      completed += domainEmails.length;
      if (domainResult.isKonsoleh) konsolehFound += domainEmails.length;
      if (domainResult.isCpanel) cpanelFound += domainEmails.length;

      const currentEmail = domainEmails[0] || domain;
      if (onProgress) {
        const stop = onProgress(completed, emails.length, currentEmail, konsolehFound, cpanelFound);
        if (stop) { shouldStop = true; break; }
      }
    }
  });

  await Promise.all(workers);

  // Build per-email results
  for (const [domain, emailList] of domainMap.entries()) {
    const domainResult = domainResults.get(domain) || {
      domain, domainExists: false, nsRecords: [], mxRecords: [], aRecord: null,
      provider: null, detectionMethod: "none" as const, confidence: "low" as const,
      isKonsoleh: false, isCpanel: false
    };
    for (const email of emailList) {
      results.push({ email, domain, formatValid: true, domainResult });
    }
  }

  return [...invalidEmails, ...results];
}

import { promises as dns } from "dns";
import { connect as netConnect } from "net";

// Patterns that indicate konsoleH / xneelo / Hetzner hosting
const KONSOLEH_PATTERNS = [
  /konsoleh\.co\.za$/i,
  /xneelo\.com$/i,
  /your-server\.de$/i,
  /hetzner\.de$/i,
  /hetzner\.co\.za$/i,
  /\.server\.host$/i,  // Common pattern for konsoleH
];

export interface VerificationResult {
  email: string;
  domain: string;
  formatValid: boolean;
  domainExists: boolean;
  mxRecords: string[];
  isKonsoleh: boolean;
  konsolehServer: string | null;
  smtpVerified: boolean;
  error?: string;
}

export function validateEmailFormat(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function extractDomain(email: string): string {
  return email.split("@")[1]?.toLowerCase() || "";
}

/**
 * Detect if MX records point to konsoleH/xneelo/Hetzner hosting
 */
export function detectKonsolehHosting(mxRecords: Array<{ exchange: string; priority: number }>): {
  isKonsoleh: boolean;
  server: string | null;
} {
  if (!mxRecords || mxRecords.length === 0) {
    return { isKonsoleh: false, server: null };
  }

  // Sort by priority (lower = higher priority)
  const sorted = [...mxRecords].sort((a, b) => a.priority - b.priority);

  for (const mx of sorted) {
    const exchange = mx.exchange.toLowerCase();
    
    // Check against konsoleH patterns
    for (const pattern of KONSOLEH_PATTERNS) {
      if (pattern.test(exchange)) {
        return { isKonsoleh: true, server: mx.exchange };
      }
    }
  }

  return { isKonsoleh: false, server: null };
}

/**
 * Perform SMTP check (RCPT TO verification)
 */
async function smtpCheck(email: string, mxHost: string, timeout = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = netConnect({ host: mxHost, port: 25, timeout });
    let response = "";
    let step = 0;

    const commands = [
      `HELO verifier.local\r\n`,
      `MAIL FROM:<verify@verifier.local>\r\n`,
      `RCPT TO:<${email}>\r\n`,
      `QUIT\r\n`,
    ];

    socket.on("data", (data) => {
      response += data.toString();
      const lines = response.split("\r\n");
      const lastLine = lines[lines.length - 2] || "";

      if (step === 0 && lastLine.startsWith("220")) {
        socket.write(commands[step++]);
      } else if (step === 1 && lastLine.startsWith("250")) {
        socket.write(commands[step++]);
      } else if (step === 2 && lastLine.startsWith("250")) {
        socket.write(commands[step++]);
      } else if (step === 3) {
        const success = lastLine.startsWith("250");
        socket.write(commands[step++]);
        socket.end();
        resolve(success);
      }
    });

    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

// Cache for domain lookups (5 min TTL)
const dnsCache = new Map<string, { mx: any[]; expires: number }>();

/**
 * Verify a single email address
 */
export async function verifyEmail(email: string): Promise<VerificationResult> {
  const result: VerificationResult = {
    email: email.toLowerCase().trim(),
    domain: "",
    formatValid: false,
    domainExists: false,
    mxRecords: [],
    isKonsoleh: false,
    konsolehServer: null,
    smtpVerified: false,
  };

  // 1. Format validation
  result.formatValid = validateEmailFormat(result.email);
  if (!result.formatValid) {
    result.error = "Invalid email format";
    return result;
  }

  // 2. Extract domain
  result.domain = extractDomain(result.email);
  if (!result.domain) {
    result.error = "Could not extract domain";
    return result;
  }

  try {
    // 3. Check DNS cache
    const now = Date.now();
    const cached = dnsCache.get(result.domain);
    let mxRecords: Array<{ exchange: string; priority: number }>;

    if (cached && cached.expires > now) {
      mxRecords = cached.mx;
    } else {
      // 4. MX lookup
      try {
        mxRecords = await dns.resolveMx(result.domain);
        dnsCache.set(result.domain, { mx: mxRecords, expires: now + 300000 });
      } catch (err: any) {
        // Try A record as fallback
        try {
          await dns.resolve4(result.domain);
          result.domainExists = true;
          result.error = "Domain exists but no MX records (may use A record for mail)";
          return result;
        } catch {
          result.error = "Domain does not exist or DNS error";
          return result;
        }
      }
    }

    result.domainExists = true;
    result.mxRecords = mxRecords.map((mx) => mx.exchange);

    // 5. Detect konsoleH hosting
    const detection = detectKonsolehHosting(mxRecords);
    result.isKonsoleh = detection.isKonsoleh;
    result.konsolehServer = detection.server;

    // 6. SMTP verification (only if we have MX records)
    if (mxRecords.length > 0) {
      const primaryMx = mxRecords.sort((a, b) => a.priority - b.priority)[0];
      try {
        result.smtpVerified = await smtpCheck(result.email, primaryMx.exchange);
      } catch {
        result.smtpVerified = false;
      }
    }
  } catch (err: any) {
    result.error = err?.message || "Verification error";
  }

  return result;
}

/**
 * Batch verification with concurrency control
 */
export async function verifyEmailBatch(
  emails: string[],
  concurrency = 10,
  onProgress?: (completed: number, total: number) => void
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  const queue = [...emails];
  let completed = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const email = queue.shift();
      if (!email) break;
      
      const result = await verifyEmail(email);
      results.push(result);
      completed++;
      
      if (onProgress) {
        onProgress(completed, emails.length);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

import dns from "dns";
import https from "https";
import net from "net";

// Server-side fetch of a URL an untrusted party chose - a Client ID Metadata Document's
// client_id. Guards against SSRF (MCP spec "Authorization Server Abuse Protection"): the
// address check runs inside the socket's own DNS lookup, so the address that's validated
// is the address that's connected to (no check-then-fetch DNS-rebinding window), and an
// IP-literal hostname - which Node connects to without calling `lookup` at all - is
// validated separately up front.

const BLOCKED_V4 = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  BLOCKED_V4.addSubnet(network, prefix, "ipv4");
}

const BLOCKED_V6 = new net.BlockList();
for (const [network, prefix] of [
  ["::", 96],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  BLOCKED_V6.addSubnet(network, prefix, "ipv6");
}

/** Whether an IP address is publicly routable (not loopback, private, link-local, reserved, ...). */
export function isPublicAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return !BLOCKED_V4.check(address, "ipv4");
  if (family !== 6) return false;

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible forms are judged by their IPv4 address.
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return !BLOCKED_V4.check(mapped[1], "ipv4");
  if (address.toLowerCase().startsWith("::ffff:")) return false;
  return !BLOCKED_V6.check(address, "ipv6");
}

type LookupFunction = typeof dns.lookup;

export class SafeFetchError extends Error {}

export interface SafeFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  /** Injectable for tests; defaults to the system resolver. */
  lookup?: LookupFunction;
}

export interface SafeFetchJsonResult {
  body: unknown;
  /** `max-age` from the response's Cache-Control header, in milliseconds, if present. */
  maxAgeMs: number | null;
}

function guardedLookup(lookup: LookupFunction): LookupFunction {
  return ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
    lookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error);
      const list = addresses as unknown as dns.LookupAddress[];
      if (list.length === 0 || list.some((entry) => !isPublicAddress(entry.address))) {
        return callback(new SafeFetchError(`${hostname} does not resolve to a public address.`));
      }
      if (options.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  }) as LookupFunction;
}

function parseMaxAge(cacheControl: string | undefined): number | null {
  if (!cacheControl) return null;
  if (/(^|,)\s*(no-store|no-cache)\s*(,|$)/i.test(cacheControl)) return 0;
  const match = cacheControl.match(/(?:^|,)\s*max-age\s*=\s*(\d+)/i);
  return match ? Number(match[1]) * 1000 : null;
}

/**
 * GETs a public https URL and parses its JSON body. No redirects, a hard timeout, and a
 * response size cap; rejects any non-200 status or non-JSON content type.
 */
export function fetchPublicJson(url: URL, options: SafeFetchOptions): Promise<SafeFetchJsonResult> {
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    return Promise.reject(new SafeFetchError("Only https URLs on the default port can be fetched."));
  }
  const literalHost = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(literalHost) && !isPublicAddress(literalHost)) {
    return Promise.reject(new SafeFetchError(`${url.hostname} is not a public address.`));
  }

  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        lookup: guardedLookup(options.lookup ?? dns.lookup),
        headers: { accept: "application/json" },
        timeout: options.timeoutMs,
      },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          return reject(new SafeFetchError(`Expected HTTP 200, got ${response.statusCode}.`));
        }
        const contentType = response.headers["content-type"] ?? "";
        if (!/^application\/([\w.+-]+\+)?json\b/i.test(contentType)) {
          response.resume();
          return reject(new SafeFetchError("Response is not JSON."));
        }

        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            request.destroy(new SafeFetchError(`Response exceeds ${options.maxBytes} bytes.`));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          try {
            resolve({
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
              maxAgeMs: parseMaxAge(response.headers["cache-control"]),
            });
          } catch {
            reject(new SafeFetchError("Response is not valid JSON."));
          }
        });
        response.on("error", reject);
      }
    );
    request.on("timeout", () => request.destroy(new SafeFetchError("Request timed out.")));
    request.on("error", (error) => reject(error instanceof SafeFetchError ? error : new SafeFetchError(error.message)));
  });
}

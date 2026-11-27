// جست‌وجوی تکمیلی در MCP عمومی دادرس؛ فقط واژگان حقوقیِ whitelist ارسال می‌شود.
import { buildSafeLegalSearchQuery } from "./legal-search.js";

const ENDPOINT = "https://mcp.dadrasai.com/mcp";
const PROTOCOL = "2025-11-25";
const ALLOWED_HOSTS = new Set(["dadrasai.com", "www.dadrasai.com"]);

export function isDadrasSourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname.toLowerCase())
      && url.pathname.startsWith("/laws/") && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function parseDadrasSearchResults(value, limit = 5) {
  const raw = String(value || "").replace(/\r/g, "");
  const blocks = raw.split(/\n(?=\d+\.\s)/u).slice(1);
  const results = [];
  const seen = new Set();
  for (const block of blocks) {
    if (results.length >= Math.max(1, Math.min(8, limit))) break;
    const titleMatch = block.match(/^\s*\d+\.\s*([^\n]+)/u);
    const urlMatch = block.match(/متن کامل\s*:\s*(https:\/\/[^\s]+)/u);
    if (!titleMatch || !urlMatch || !isDadrasSourceUrl(urlMatch[1])) continue;
    const url = new URL(urlMatch[1]).href;
    if (seen.has(url)) continue;
    seen.add(url);
    const excerpt = block
      .replace(/^\s*\d+\.\s*[^\n]+\n/u, "")
      .split(/\n\s*متن کامل\s*:/u)[0]
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 500);
    results.push({
      title: titleMatch[1].trim().slice(0, 180),
      url,
      domain: "dadrasai.com",
      type: "منبع حقوقی تکمیلی",
      status: "منبع ثانویه؛ برای تطبیق با متن رسمی",
      excerpt,
    });
  }
  return results;
}

function parseMcpResponse(response, raw) {
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("text/event-stream")) {
    try { return JSON.parse(raw); } catch { return null; }
  }
  const messages = [];
  for (const line of raw.split(/\r?\n/u)) {
    if (!line.startsWith("data:")) continue;
    const value = line.slice(5).trim();
    if (!value || value === "[DONE]") continue;
    try { messages.push(JSON.parse(value)); } catch {}
  }
  return messages.at(-1) || null;
}

/**
 * Only a sanitized whitelist query leaves the Worker. No case narrative, names,
 * dates, file text, identifiers or client data are transmitted to the provider.
 * Returned content is secondary discovery metadata, never a verified authority.
 */
export async function searchDadrasLegal(input, { limit = 5, timeoutMs = 4500 } = {}) {
  const query = buildSafeLegalSearchQuery(input);
  if (!query) return { status: "no_legal_terms", sources: [] };
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
        "MCP-Protocol-Version": PROTOCOL,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "search_iranian_law",
          arguments: { query: query.slice(0, 450), limit: Math.max(1, Math.min(8, limit)) },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { status: "unavailable", sources: [], httpStatus: response.status };
    const raw = (await response.text()).slice(0, 40_000);
    const payload = parseMcpResponse(response, raw);
    if (!payload || payload.error || !payload.result || payload.result.isError) return { status: "unavailable", sources: [] };
    const text = (Array.isArray(payload.result.content) ? payload.result.content : [])
      .filter((item) => item?.type === "text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("\n");
    const sources = parseDadrasSearchResults(text, limit);
    return { status: sources.length ? "searched" : "no_results", sources };
  } catch (error) {
    return { status: error?.name === "TimeoutError" ? "timeout" : "unavailable", sources: [] };
  }
}

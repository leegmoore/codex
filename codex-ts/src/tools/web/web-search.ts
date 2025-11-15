import type { SearchResult } from "./search.js";

export interface WebSearchParams {
  query: string;
  maxResults?: number;
}

export interface WebSearchResult {
  results: SearchResult[];
}

const PERPLEXITY_SEARCH_ENDPOINT = "https://api.perplexity.ai/search";
const DEFAULT_MAX_RESULTS = 10;
const MAX_ALLOWED_RESULTS = 25;

export async function webSearch(
  params: WebSearchParams,
): Promise<WebSearchResult> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY environment variable not set");
  }

  const maxResults = clampResults(params.maxResults);

  const response = await fetch(PERPLEXITY_SEARCH_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: params.query,
      top_k: maxResults,
      model: "sonar-pro",
    }),
  });

  if (!response.ok) {
    const errorText = await safeReadText(response);
    throw new Error(
      `Perplexity search API error (${response.status}): ${errorText}`,
    );
  }

  const payload = (await response.json()) as unknown;
  const results = extractSearchResults(payload, maxResults);

  return { results };
}

function clampResults(value: number | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.min(Math.max(Math.floor(value), 1), MAX_ALLOWED_RESULTS);
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<failed to read error body>";
  }
}

function extractSearchResults(payload: unknown, max: number): SearchResult[] {
  const entries = readResultEntries(payload);
  const mapped = entries
    .map((entry, index) => mapEntryToResult(entry, max - index))
    .filter((result): result is SearchResult => result !== undefined);
  return mapped.slice(0, max);
}

function readResultEntries(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const table = payload as Record<string, unknown>;
  if (Array.isArray(table.results)) {
    return table.results.filter(isObject);
  }
  if (Array.isArray(table.data)) {
    return table.data.filter(isObject);
  }
  return [];
}

function mapEntryToResult(
  entry: Record<string, unknown>,
  fallbackScore: number,
): SearchResult | undefined {
  const url =
    readString(entry.url) ??
    readString(entry.link) ??
    readString((entry.source as Record<string, unknown> | undefined)?.url);
  if (!url) {
    return undefined;
  }

  const title =
    readString(entry.title) ??
    readString(entry.text) ??
    readString((entry.source as Record<string, unknown> | undefined)?.title) ??
    extractTitleFromUrl(url);

  const snippet =
    readString(entry.snippet) ??
    readString(entry.description) ??
    readString(entry.summary) ??
    "";

  const relevanceScore =
    typeof entry.score === "number"
      ? entry.score
      : typeof entry.rank === "number"
        ? entry.rank
        : fallbackScore;

  return {
    url,
    title,
    snippet: snippet || "No description available.",
    relevanceScore,
  };
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }
  return undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractTitleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const domain = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.split("/").filter(Boolean).join(" · ");
    return path ? `${domain}: ${path}` : domain;
  } catch {
    return url;
  }
}

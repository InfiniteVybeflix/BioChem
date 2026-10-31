/**
 * Open-web media for AI answers.
 *
 * When the model decides a picture or further reading would help, the
 * server resolves REAL resources — no hallucinated URLs:
 *
 *   • Images — Wikimedia Commons search (open licences, with artist
 *     and licence attribution from the file metadata).
 *   • Links  — Wikipedia page search (real, verified URLs).
 *
 * Both endpoints are public and keyless; every call is timeout-guarded
 * and failures degrade to "no media" rather than blocking the answer.
 */

export interface ResolvedImage {
  url: string;
  alt: string;
  thumbUrl: string;
  width: number;
  height: number;
  credit: string;
  license: string;
  source: string;
  pageUrl: string;
}

export interface ResolvedLink {
  title: string;
  url: string;
  snippet: string;
}

const COMMONS_ENDPOINT = "https://commons.wikimedia.org/w/api.php";
const WIKIPEDIA_ENDPOINT = "https://en.wikipedia.org/w/rest.php/v1/search/page";

interface CommonsImageInfo {
  url?: string;
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string }>;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, "").trim();
}

async function fetchJson(url: string, timeoutMs = 6000): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "BioChem/1.0 (study platform)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

/** Searches Wikimedia Commons for one usable, attributed image. */
export async function searchCommonsImage(query: string): Promise<ResolvedImage | null> {
  try {
    const params = new URLSearchParams({
      action: "query",
      format: "json",
      generator: "search",
      gsrsearch: `filetype:bitmap|drawing ${query}`,
      gsrnamespace: "6",
      gsrlimit: "5",
      prop: "imageinfo",
      iiprop: "url|extmetadata|mime|size",
      iiurlwidth: "900",
      origin: "*",
    });
    const payload = (await fetchJson(`${COMMONS_ENDPOINT}?${params}`)) as {
      query?: { pages?: Record<string, { title?: string; imageinfo?: CommonsImageInfo[] }> };
    };
    const pages = payload.query?.pages ? Object.values(payload.query.pages) : [];
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info?.thumburl || !info.url) continue;
      const meta = info.extmetadata ?? {};
      return {
        url: info.thumburl,
        thumbUrl: info.thumburl,
        alt:
          page.title?.replace(/^File:/, "").replace(/\.(jpg|jpeg|png|gif|svg|webp)$/i, "") ?? query,
        width: info.thumbwidth ?? 900,
        height: info.thumbheight ?? 600,
        credit: stripHtml(meta.Artist?.value ?? "Wikimedia Commons contributor"),
        license: stripHtml(meta.LicenseShortName?.value ?? "See file page"),
        source: "Wikimedia Commons",
        pageUrl: info.descriptionurl ?? "https://commons.wikimedia.org",
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** Searches Wikipedia for real reference links. */
export async function searchWikipediaLinks(query: string, limit = 3): Promise<ResolvedLink[]> {
  try {
    const params = new URLSearchParams({ q: query, limit: String(limit) });
    const payload = (await fetchJson(`${WIKIPEDIA_ENDPOINT}?${params}`)) as {
      pages?: { title?: string; key?: string; excerpt?: string }[];
    };
    return (payload.pages ?? [])
      .filter((page) => page.title && page.key)
      .slice(0, limit)
      .map((page) => ({
        title: page.title ?? "",
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.key ?? "")}`,
        snippet: stripHtml(page.excerpt ?? "").slice(0, 180),
      }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Marker protocol shared with the tutor prompt
// ---------------------------------------------------------------------------

export const MEDIA_MARKER_RE = /\[\[MEDIA:\s*([^\]]+)\]\]/;
export const LINKS_MARKER_RE = /\[\[LINKS:\s*([^\]]+)\]\]/;

export interface MediaMarkers {
  cleanText: string;
  imageQueries: string[];
  linkQueries: string[];
}

/**
 * Extracts the trailing `[[MEDIA: q1 | q2]]` / `[[LINKS: t1 | t2]]`
 * markers the model may append, returning the cleaned answer text.
 */
export function extractMediaMarkers(text: string): MediaMarkers {
  let clean = text;
  const imageQueries: string[] = [];
  const linkQueries: string[] = [];

  const mediaMatch = clean.match(MEDIA_MARKER_RE);
  if (mediaMatch) {
    imageQueries.push(
      ...mediaMatch[1]
        .split("|")
        .map((part) => part.trim())
        .filter((part) => part.length > 1)
        .slice(0, 3),
    );
    clean = clean.replace(MEDIA_MARKER_RE, "");
  }
  const linksMatch = clean.match(LINKS_MARKER_RE);
  if (linksMatch) {
    linkQueries.push(
      ...linksMatch[1]
        .split("|")
        .map((part) => part.trim())
        .filter((part) => part.length > 1)
        .slice(0, 3),
    );
    clean = clean.replace(LINKS_MARKER_RE, "");
  }

  return { cleanText: clean.trimEnd(), imageQueries, linkQueries };
}

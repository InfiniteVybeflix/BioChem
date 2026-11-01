import { requireAdminApi } from "@/lib/admin/session";

/**
 * Console import — document text extraction.
 *
 *   POST multipart/form-data { file } → { text, meta }
 *
 * Lets the operator drop a PDF, Word, PowerPoint or Excel export instead of
 * hand-pasting text; the extracted material is then fed to the AI CSV
 * converter (api/import/ai). Everything runs on the Node runtime with pure-JS
 * parsers, so it deploys unchanged to Vercel's serverless functions.
 */

export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB — generous for slide decks/papers
const MAX_CHARS = 200_000; // extraction truncates well before AI limits

const KIND_LABELS: Record<string, string> = {
  pdf: "PDF document",
  docx: "Word document",
  pptx: "PowerPoint presentation",
  xlsx: "Excel workbook",
  text: "Plain text",
};

function jsonError(error: string, status = 422): Response {
  return Response.json({ error }, { status });
}

/** PDF text via unpdf (bundled pdf.js, serverless-friendly). */
async function extractPdf(bytes: ArrayBuffer) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { text, pages: totalPages };
}

/** Word .docx text via mammoth (legacy .doc is a binary format — rejected). */
async function extractDocx(bytes: ArrayBuffer) {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return { text: result.value };
}

/** PowerPoint .pptx slide text: read each slide's XML and pull its runs. */
async function extractPptx(bytes: ArrayBuffer) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = Number(a.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      const numB = Number(b.match(/slide(\d+)\.xml$/)?.[1] ?? 0);
      return numA - numB;
    });
  if (slideNames.length === 0) return { text: "", slides: 0 };

  const pages: string[] = [];
  for (const name of slideNames) {
    const xml = await zip.files[name].async("string");
    // Collect text runs (<a:t>…</a:t>) in document order; join runs on one
    // line, slides separated by blank lines.
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((match) =>
      match[1]
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'"),
    );
    if (runs.length > 0) pages.push(runs.join(" ").trim());
  }
  return { text: pages.join("\n\n"), slides: pages.length };
}

/** Excel .xlsx: every sheet flattened to CSV text. */
async function extractXlsx(bytes: ArrayBuffer) {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(Buffer.from(bytes), { type: "buffer" });
  const parts: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    parts.push(`# Sheet: ${name}\n${XLSX.utils.sheet_to_csv(sheet)}`);
  }
  return { text: parts.join("\n\n"), sheets: workbook.SheetNames.length };
}

export async function POST(request: Request): Promise<Response> {
  const denied = await requireAdminApi();
  if (denied) return denied;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError("Expected a multipart form upload");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError("No file was uploaded");
  if (file.size === 0) return jsonError("The uploaded file is empty");
  if (file.size > MAX_BYTES) return jsonError("File is larger than 12 MB");

  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf(".") + 1);
  const bytes = await file.arrayBuffer();

  let text = "";
  let kind = "text";
  const meta: Record<string, number | boolean | string> = {};

  try {
    if (ext === "pdf" || file.type === "application/pdf") {
      kind = "pdf";
      const result = await extractPdf(bytes);
      text = result.text;
      meta.pages = result.pages ?? 0;
    } else if (ext === "docx") {
      kind = "docx";
      const result = await extractDocx(bytes);
      text = result.text;
    } else if (ext === "pptx") {
      kind = "pptx";
      const result = await extractPptx(bytes);
      text = result.text;
      meta.slides = result.slides ?? 0;
    } else if (ext === "xlsx" || ext === "xlsm") {
      kind = "xlsx";
      const result = await extractXlsx(bytes);
      text = result.text;
      meta.sheets = result.sheets ?? 0;
    } else if (ext === "xls") {
      return jsonError("Legacy .xls workbooks aren't supported — re-save as .xlsx");
    } else if (ext === "doc") {
      return jsonError(
        "Legacy .doc files aren't supported — open it in Word and re-save as .docx",
      );
    } else if (ext === "ppt") {
      return jsonError(
        "Legacy .ppt files aren't supported — open it in PowerPoint and re-save as .pptx",
      );
    } else if (["txt", "md", "csv", "tsv", "json", "rtf"].includes(ext)) {
      kind = "text";
      text = await file.text();
      if (ext === "rtf") {
        // Very light RTF strip: drop control words and brace groups.
        text = text
          .replace(/\\'([0-9a-f]{2})/gi, " ")
          .replace(/\\[a-z]+-?\d* ?/gi, " ")
          .replace(/[{}]/g, "");
      }
    } else {
      return jsonError(
        `Unsupported file type ".${ext}" — use PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), or a plain text/markdown/CSV file`,
      );
    }
  } catch (error) {
    console.error("[console-api/import/extract] extraction failed:", error);
    return jsonError(
      "Could not read that file — it may be corrupted or password-protected. Try exporting it again.",
      502,
    );
  }

  const trimmed = text.replace(/\u0000/g, "").trim();
  if (trimmed.length < 20) {
    return jsonError(
      "Almost no readable text was found — if this is a scanned document, the pages are images and need OCR first.",
    );
  }
  const truncated = trimmed.length > MAX_CHARS;
  const finalText = truncated ? `${trimmed.slice(0, MAX_CHARS)}…` : trimmed;

  return Response.json({
    text: finalText,
    meta: {
      kind,
      label: KIND_LABELS[kind] ?? "Document",
      truncated,
      characters: finalText.length,
      ...meta,
    },
  });
}

/**
 * Attachment text extraction for agent context.
 *
 * Reads Markdown and PDF attachment bodies from storage and returns
 * extracted text for inclusion in GET /api/issues/:id when the caller
 * is an agent. Handles errors (too large, invalid PDF) with metadata-only
 * entries and clear messages.
 */

import type { Readable } from "node:stream";
import type { StorageService } from "./storage/types.js";

/** Max bytes to read per attachment for text extraction (agent context). */
export const MAX_ATTACHMENT_CONTENT_BYTES =
  Number(process.env.PAPERCLIP_ATTACHMENT_CONTENT_MAX_BYTES) || 5 * 1024 * 1024;

/** Max characters of extracted text to return per attachment (long PDFs). */
export const MAX_ATTACHMENT_TEXT_CHARS =
  Number(process.env.PAPERCLIP_ATTACHMENT_TEXT_MAX_CHARS) || 100_000;

const PDF_MIME = "application/pdf";
const MD_MIME = "text/markdown";
const MD_ALT = "text/x-markdown";

export function isTextExtractableContentType(contentType: string | null | undefined): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return ct === PDF_MIME || ct === MD_MIME || ct === MD_ALT;
}

function streamToBuffer(stream: Readable, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    stream.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        stream.destroy();
        reject(new Error(`Attachment exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // pdf-parse (modesty 1.x): default export is (buffer) => Promise<{ text, numpages, ... }>
  const m = await import("pdf-parse");
  const fn =
    typeof (m as { default?: (buf: Buffer) => Promise<{ text?: string }> }).default === "function"
      ? (m as { default: (buf: Buffer) => Promise<{ text?: string }> }).default
      : undefined;
  if (!fn) throw new Error("pdf-parse: expected default export function");
  const data = await fn(buffer);
  return data?.text ?? "";
}

export interface AttachmentRow {
  id: string;
  companyId: string;
  objectKey: string;
  contentType: string | null;
  byteSize: number | null;
  originalFilename: string | null;
}

export interface AttachmentContentEntry {
  attachmentId: string;
  filename: string | null;
  contentType: string | null;
  text?: string;
  error?: string;
}

/**
 * Load text contents for issue attachments that support it (markdown, PDF).
 * Returns one entry per attachment; extractable types get `text` or `error`.
 */
export async function getAttachmentContents(
  attachments: AttachmentRow[],
  storage: StorageService,
  options: {
    maxBytes?: number;
    maxTextChars?: number;
  } = {},
): Promise<AttachmentContentEntry[]> {
  const maxBytes = options.maxBytes ?? MAX_ATTACHMENT_CONTENT_BYTES;
  const maxChars = options.maxTextChars ?? MAX_ATTACHMENT_TEXT_CHARS;

  const results: AttachmentContentEntry[] = [];

  for (const att of attachments) {
    const filename = att.originalFilename ?? null;
    const contentType = att.contentType ?? null;

    if (!isTextExtractableContentType(contentType)) {
      results.push({ attachmentId: att.id, filename, contentType });
      continue;
    }

    try {
      const obj = await storage.getObject(att.companyId, att.objectKey);
      const buffer = await streamToBuffer(obj.stream, maxBytes);

      if (buffer.length === 0) {
        results.push({ attachmentId: att.id, filename, contentType, text: "" });
        continue;
      }

      let text: string;
      if (contentType?.toLowerCase() === PDF_MIME) {
        text = await extractTextFromPdf(buffer);
      } else {
        text = buffer.toString("utf-8");
      }

      if (text.length > maxChars) {
        text = text.slice(0, maxChars) + "\n\n[... Inhalt gekürzt; Zeichenlimit für Agent-Kontext erreicht ...]";
      }
      results.push({ attachmentId: att.id, filename, contentType, text });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({
        attachmentId: att.id,
        filename,
        contentType,
        error: message,
      });
    }
  }

  return results;
}

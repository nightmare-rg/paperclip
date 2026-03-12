import { describe, it, expect, vi, beforeEach } from "vitest";
import { Readable } from "node:stream";
import {
  isTextExtractableContentType,
  getAttachmentContents,
  type AttachmentRow,
} from "../attachment-contents.js";
import type { StorageService } from "../storage/types.js";

describe("isTextExtractableContentType", () => {
  it("returns true for application/pdf and text/markdown types", () => {
    expect(isTextExtractableContentType("application/pdf")).toBe(true);
    expect(isTextExtractableContentType("text/markdown")).toBe(true);
    expect(isTextExtractableContentType("text/x-markdown")).toBe(true);
  });

  it("returns false for image and other types", () => {
    expect(isTextExtractableContentType("image/png")).toBe(false);
    expect(isTextExtractableContentType("text/plain")).toBe(false);
    expect(isTextExtractableContentType("application/octet-stream")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isTextExtractableContentType(null)).toBe(false);
    expect(isTextExtractableContentType(undefined)).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isTextExtractableContentType("Application/PDF")).toBe(true);
    expect(isTextExtractableContentType("TEXT/MARKDOWN")).toBe(true);
  });
});

function streamFromBuffer(buf: Buffer): Readable {
  return Readable.from(buf);
}

describe("getAttachmentContents", () => {
  let mockStorage: StorageService;

  beforeEach(() => {
    mockStorage = {
      getObject: vi.fn(),
      putFile: vi.fn(),
      headObject: vi.fn(),
      deleteObject: vi.fn(),
      provider: "local_disk",
    } as unknown as StorageService;
  });

  it("returns empty array for no attachments", async () => {
    const result = await getAttachmentContents([], mockStorage);
    expect(result).toEqual([]);
  });

  it("returns metadata-only for non-extractable types (e.g. image)", async () => {
    const attachments: AttachmentRow[] = [
      {
        id: "att-1",
        companyId: "co-1",
        objectKey: "key1",
        contentType: "image/png",
        byteSize: 100,
        originalFilename: "pic.png",
      },
    ];
    const result = await getAttachmentContents(attachments, mockStorage);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      attachmentId: "att-1",
      filename: "pic.png",
      contentType: "image/png",
    });
    expect(mockStorage.getObject).not.toHaveBeenCalled();
  });

  it("returns extracted text for text/markdown attachment", async () => {
    const attachments: AttachmentRow[] = [
      {
        id: "att-md",
        companyId: "co-1",
        objectKey: "key.md",
        contentType: "text/markdown",
        byteSize: 12,
        originalFilename: "readme.md",
      },
    ];
    vi.mocked(mockStorage.getObject).mockResolvedValue({
      stream: streamFromBuffer(Buffer.from("# Hello\n\nWorld.", "utf-8")),
    });

    const result = await getAttachmentContents(attachments, mockStorage);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      attachmentId: "att-md",
      filename: "readme.md",
      contentType: "text/markdown",
      text: "# Hello\n\nWorld.",
    });
    expect(result[0]).not.toHaveProperty("error");
  });

  it("returns error entry when storage getObject fails", async () => {
    const attachments: AttachmentRow[] = [
      {
        id: "att-fail",
        companyId: "co-1",
        objectKey: "key.md",
        contentType: "text/markdown",
        byteSize: 10,
        originalFilename: "x.md",
      },
    ];
    vi.mocked(mockStorage.getObject).mockRejectedValue(new Error("Object not found"));

    const result = await getAttachmentContents(attachments, mockStorage);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      attachmentId: "att-fail",
      filename: "x.md",
      contentType: "text/markdown",
      error: "Object not found",
    });
    expect(result[0]).not.toHaveProperty("text");
  });

  it("truncates text when over maxTextChars", async () => {
    const longContent = "x".repeat(150);
    const attachments: AttachmentRow[] = [
      {
        id: "att-long",
        companyId: "co-1",
        objectKey: "key.md",
        contentType: "text/markdown",
        byteSize: 150,
        originalFilename: "long.md",
      },
    ];
    vi.mocked(mockStorage.getObject).mockResolvedValue({
      stream: streamFromBuffer(Buffer.from(longContent, "utf-8")),
    });

    const result = await getAttachmentContents(attachments, mockStorage, {
      maxBytes: 1024,
      maxTextChars: 50,
    });
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain("x".repeat(50));
    expect(result[0].text).toContain("[... Inhalt gekürzt");
  });

  it("returns empty text for zero-byte extractable attachment", async () => {
    const attachments: AttachmentRow[] = [
      {
        id: "att-empty",
        companyId: "co-1",
        objectKey: "key.md",
        contentType: "text/markdown",
        byteSize: 0,
        originalFilename: "empty.md",
      },
    ];
    vi.mocked(mockStorage.getObject).mockResolvedValue({
      stream: streamFromBuffer(Buffer.alloc(0)),
    });

    const result = await getAttachmentContents(attachments, mockStorage);
    expect(result[0].text).toBe("");
  });
});

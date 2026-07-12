import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the three external boundaries so the tests exercise the pipeline's own
// logic (ordering, guards, fallbacks) without decoding real images.
vi.mock("browser-image-compression", () => ({ default: vi.fn() }));
vi.mock("file-type", () => ({ fileTypeFromBlob: vi.fn() }));
vi.mock("../src/heicConvert", () => ({ convertHeicToJpeg: vi.fn() }));

import imageCompression from "browser-image-compression";
import { fileTypeFromBlob } from "file-type";
import { convertHeicToJpeg } from "../src/heicConvert";
import { processImage, UploadValidationError } from "../src/index";

const compress = vi.mocked(imageCompression);
const sniff = vi.mocked(fileTypeFromBlob);
const heic = vi.mocked(convertHeicToJpeg);

/** Build a File whose reported `size` we can control without allocating bytes. */
function makeFile(size: number, name: string, type: string): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy path: valid JPEG in, small JPEG out.
  sniff.mockResolvedValue({ ext: "jpg", mime: "image/jpeg" } as never);
  compress.mockResolvedValue(makeFile(200_000, "out.jpg", "image/jpeg"));
});

describe("processImage", () => {
  it("returns a sanitized JPEG File on the happy path", async () => {
    const input = makeFile(1_000_000, "my photo (final)!.png", "image/png");
    sniff.mockResolvedValue({ ext: "png", mime: "image/png" } as never);

    const out = await processImage(input);

    expect(out).toBeInstanceOf(File);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("my_photo__final__.jpg");
    expect(out.name).not.toMatch(/[^A-Za-z0-9_.-]/);
  });

  it("rejects raw input larger than maxInputBytes without touching the compressor", async () => {
    const huge = makeFile(40 * 1024 * 1024, "huge.jpg", "image/jpeg");

    await expect(processImage(huge)).rejects.toMatchObject({
      kind: "FileTooLarge",
    });
    expect(sniff).not.toHaveBeenCalled();
    expect(compress).not.toHaveBeenCalled();
  });

  it("trusts the sniffed MIME, not the file extension, and rejects a disguised file", async () => {
    // Named .jpg, but the magic bytes say PDF.
    const disguised = makeFile(1000, "invoice.jpg", "image/jpeg");
    sniff.mockResolvedValue({ ext: "pdf", mime: "application/pdf" } as never);

    await expect(processImage(disguised)).rejects.toMatchObject({
      kind: "BadMime",
    });
    expect(compress).not.toHaveBeenCalled();
  });

  it("rejects when the sniffer can't identify the file", async () => {
    sniff.mockResolvedValue(undefined as never);

    await expect(
      processImage(makeFile(1000, "mystery.bin", "application/octet-stream")),
    ).rejects.toMatchObject({ kind: "BadMime" });
  });

  it("converts HEIC before compressing", async () => {
    const heicFile = makeFile(2_000_000, "IMG_0001.HEIC", "image/heic");
    sniff.mockResolvedValue({ ext: "heic", mime: "image/heic" } as never);
    heic.mockResolvedValue(makeFile(1_500_000, "IMG_0001.jpg", "image/jpeg"));

    const out = await processImage(heicFile);

    expect(heic).toHaveBeenCalledOnce();
    expect(compress).toHaveBeenCalledOnce();
    expect(out.type).toBe("image/jpeg");
  });

  it("rejects when the compressed output still exceeds the hard cap", async () => {
    compress.mockResolvedValue(makeFile(6 * 1024 * 1024, "big.jpg", "image/jpeg"));

    await expect(
      processImage(makeFile(1000, "photo.jpg", "image/jpeg")),
    ).rejects.toMatchObject({ kind: "FileTooLarge" });
  });

  it("accepts output over the soft target but under the hard cap", async () => {
    // 4 MB out, 2 MB soft target, 5 MB hard cap → accepted (target is advisory).
    compress.mockResolvedValue(makeFile(4 * 1024 * 1024, "photo.jpg", "image/jpeg"));

    const out = await processImage(makeFile(1000, "photo.jpg", "image/jpeg"), {
      targetBytes: 2 * 1024 * 1024,
      maxBytes: 5 * 1024 * 1024,
    });

    expect(out).toBeInstanceOf(File);
    expect(out.type).toBe("image/jpeg");
  });

  it("falls back to the main thread when the worker path fails", async () => {
    compress
      .mockRejectedValueOnce(new Error("no OffscreenCanvas"))
      .mockResolvedValueOnce(makeFile(150_000, "out.jpg", "image/jpeg"));

    const out = await processImage(makeFile(1000, "photo.jpg", "image/jpeg"));

    expect(compress).toHaveBeenCalledTimes(2);
    expect(compress.mock.calls[0]?.[1]).toMatchObject({ useWebWorker: true });
    expect(compress.mock.calls[1]?.[1]).toMatchObject({ useWebWorker: false });
    expect(out).toBeInstanceOf(File);
  });

  it("wraps an unexpected sniff failure as DecodeFailed", async () => {
    sniff.mockRejectedValue(new Error("boom"));

    const err = await processImage(
      makeFile(1000, "photo.jpg", "image/jpeg"),
    ).catch((e) => e);

    expect(err).toBeInstanceOf(UploadValidationError);
    expect(err.kind).toBe("DecodeFailed");
  });

  it("forwards a custom workerLibURL to the worker call", async () => {
    await processImage(makeFile(1000, "photo.jpg", "image/jpeg"), {
      workerLibURL: "/assets/bic.js",
    });

    expect(compress.mock.calls[0]?.[1]).toMatchObject({
      libURL: "/assets/bic.js",
    });
  });
});

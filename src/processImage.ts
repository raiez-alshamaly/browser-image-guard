/**
 * Image upload pipeline — a single entry point for any image bound for a server.
 *
 * Steps, in order:
 *   1. Early size guard on the RAW input (avoids OOM-ing the decode on cheap devices).
 *   2. Magic-byte sniff via `file-type` — `file.type` is spoofable and MUST NOT be trusted.
 *   3. HEIC / HEIF to JPEG conversion (lazy `heic2any`).
 *   4. MIME whitelist check (post-conversion).
 *   5. Compression + resize + EXIF strip via `browser-image-compression`
 *      (runs in a Web Worker where supported; orientation is corrected and all
 *      EXIF metadata including GPS is dropped as a side effect of re-encode).
 *   6. Final HARD size assertion against the output cap.
 *   7. Filename sanitization — strip path-traversal / injection characters, force .jpg.
 *
 * Throws `UploadValidationError` with a `kind` the caller can narrow on. Never
 * throws a raw `Error`.
 */
import imageCompression from "browser-image-compression";
import { fileTypeFromBlob } from "file-type";
import {
  ALLOWED_UPLOAD_MIMES,
  MAX_INPUT_BYTES,
  MAX_UPLOAD_BYTES,
  type AllowedUploadMime,
} from "./constraints";
import { UploadValidationError } from "./errors";
import { convertHeicToJpeg } from "./heicConvert";

export interface ProcessImageOptions {
  /**
   * Hard OUTPUT ceiling (post-compression), in bytes. The ONLY size that can
   * reject a file. Defaults to `MAX_UPLOAD_BYTES` (5 MB). Do NOT lower this to
   * "encourage smaller uploads": the compressor target is soft, so a low
   * `maxBytes` bounces valid photos it merely could not squeeze small enough.
   * Use `targetBytes` for that instead.
   */
  maxBytes?: number;
  /**
   * SOFT compression target, in bytes, handed to the compressor as `maxSizeMB`.
   * The compressor aims for it but may overshoot on noisy inputs — bounded by
   * `maxBytes`, never by this. Defaults to `maxBytes`. Set it BELOW `maxBytes`
   * to push uploads smaller without risking a false "too large" rejection.
   */
  targetBytes?: number;
  /**
   * Largest RAW input accepted into the decoder, in bytes. Independent of
   * `maxBytes` — a big camera original is compressed down, not rejected.
   * Defaults to `MAX_INPUT_BYTES` (32 MB).
   */
  maxInputBytes?: number;
  /** Accepted MIME types after sniffing. Defaults to `ALLOWED_UPLOAD_MIMES`. */
  allowedMimes?: readonly AllowedUploadMime[];
  /** Longest-edge cap in pixels, passed to the compressor. Defaults to 1920. */
  maxWidthOrHeight?: number;
  /**
   * Starting JPEG quality for the compressor size-search loop (0 to 1). Lower =
   * smaller files at some visual cost. Defaults to 0.85.
   */
  initialQuality?: number;
  /**
   * URL to load the compression library from inside the Web Worker. Pass a
   * same-origin URL when a strict `script-src` CSP blocks the library default
   * CDN. When omitted, `browser-image-compression` uses its own default.
   */
  workerLibURL?: string;
}

// Safety ceilings that turn a stalled async step into a clean error/fallback
// instead of a spinner that never resolves.
const WORKER_COMPRESS_TIMEOUT_MS = 20_000;
const HEIC_CONVERT_TIMEOUT_MS = 30_000;

/** Reject a promise if it has not settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(label + " timed out after " + ms + "ms")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

interface CompressParams {
  maxSizeMB: number;
  maxWidthOrHeight: number;
  initialQuality: number;
  workerLibURL?: string;
}

/**
 * Compress to JPEG, preferring the Web Worker but never depending on it.
 *
 * The worker keeps the main thread responsive, but it is the FRAGILE path:
 * older iOS Safari and several mobile browsers cannot run the compressor in a
 * worker (no `OffscreenCanvas`), where the library either rejects or — worse —
 * never posts a result back and the spinner hangs forever. On ANY worker
 * failure, or if it stalls past the timeout, we retry on the MAIN THREAD, which
 * has no worker / OffscreenCanvas dependency and completes on every browser.
 */
async function compressToJpeg(input: File, params: CompressParams): Promise<File> {
  const base = {
    maxSizeMB: params.maxSizeMB,
    maxWidthOrHeight: params.maxWidthOrHeight,
    initialQuality: params.initialQuality,
    fileType: "image/jpeg" as const,
  };
  try {
    return await withTimeout(
      imageCompression(input, {
        ...base,
        useWebWorker: true,
        ...(params.workerLibURL ? { libURL: params.workerLibURL } : {}),
      }),
      WORKER_COMPRESS_TIMEOUT_MS,
      "image compression worker",
    );
  } catch {
    // Main-thread fallback — no worker, no OffscreenCanvas, no importScripts.
    return imageCompression(input, { ...base, useWebWorker: false });
  }
}

// Allow only alphanumerics, underscore, and hyphen in the base name — dots are
// deliberately excluded so path-traversal fragments and hidden-file markers
// cannot survive sanitization.
const FILENAME_INVALID = /[^A-Za-z0-9_-]/g;
const FILENAME_CAP = 76;

function sanitizeFilename(name: string): string {
  const stripped = name.replace(/\.[^./\\]+$/, "");
  const cleaned = stripped.replace(FILENAME_INVALID, "_").slice(0, FILENAME_CAP);
  return (cleaned || "image") + ".jpg";
}

/**
 * Validate, normalize, and compress a user-selected image into a clean JPEG
 * `File` ready to append to `FormData`.
 */
export async function processImage(
  file: File,
  options: ProcessImageOptions = {},
): Promise<File> {
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  // Soft target for the compressor — only shrinks how hard it tries, never rejects.
  const targetBytes = Math.min(options.targetBytes ?? maxBytes, maxBytes);
  const maxInputBytes = options.maxInputBytes ?? MAX_INPUT_BYTES;
  const allowedMimes = options.allowedMimes ?? ALLOWED_UPLOAD_MIMES;
  const maxWidthOrHeight = options.maxWidthOrHeight ?? 1920;
  const initialQuality = options.initialQuality ?? 0.85;

  // Early reject — only on inputs so large they would risk OOM-ing the decode.
  // This is the RAW-input ceiling, NOT the output cap: a large phone photo MUST
  // flow through and be compressed down. The final assertion against `maxBytes`
  // (post-compression) enforces the output limit.
  if (file.size > maxInputBytes) {
    throw new UploadValidationError("FileTooLarge");
  }

  let detected;
  try {
    detected = await fileTypeFromBlob(file);
  } catch (err) {
    throw new UploadValidationError("DecodeFailed", err);
  }

  let working = file;
  let detectedMime: string | undefined = detected?.mime;

  if (detectedMime === "image/heic" || detectedMime === "image/heif") {
    try {
      working = await withTimeout(
        convertHeicToJpeg(file),
        HEIC_CONVERT_TIMEOUT_MS,
        "HEIC conversion",
      );
    } catch (err) {
      throw err instanceof UploadValidationError
        ? err
        : new UploadValidationError("HeicConvertFailed", err);
    }
    detectedMime = "image/jpeg";
  }

  if (!detectedMime || !allowedMimes.includes(detectedMime as AllowedUploadMime)) {
    throw new UploadValidationError("BadMime");
  }

  let compressed: File;
  try {
    compressed = await compressToJpeg(working, {
      maxSizeMB: targetBytes / 1_048_576,
      maxWidthOrHeight,
      initialQuality,
      workerLibURL: options.workerLibURL,
    });
  } catch (err) {
    throw new UploadValidationError("DecodeFailed", err);
  }

  // The compressor treats `maxSizeMB` (our soft `targetBytes`) as a target, not
  // a strict bound — the quality search can overshoot on noisy inputs. We only
  // reject at the HARD `maxBytes` cap: a valid image a little over the soft
  // target is still fine and must not be bounced.
  if (compressed.size > maxBytes) {
    throw new UploadValidationError("FileTooLarge");
  }

  const safeName = sanitizeFilename(file.name);
  return new File([compressed], safeName, { type: "image/jpeg" });
}

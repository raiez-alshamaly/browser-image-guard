/**
 * Default upload constraints.
 *
 * These are sane starting points, not hard requirements — every one of them is
 * overridable per call via `ProcessImageOptions`. If your server enforces its
 * own limits, mirror them here (or pass them in) so the client rejects early
 * instead of round-tripping a file the server will only bounce.
 */

/** MIME types accepted after magic-byte sniffing (HEIC is converted to JPEG first). */
export const ALLOWED_UPLOAD_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AllowedUploadMime = (typeof ALLOWED_UPLOAD_MIMES)[number];

/**
 * Hard OUTPUT ceiling (post-compression), in bytes. The ONLY size that can
 * reject a file. Default: 5 MB.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Largest RAW input accepted into the decoder, in bytes. A big camera original
 * is compressed down, not rejected — this ceiling only exists to avoid OOM on
 * low-end devices. Default: 32 MB.
 */
export const MAX_INPUT_BYTES = 32 * 1024 * 1024;

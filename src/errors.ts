/**
 * The single error type this library throws. It never throws a raw `Error`:
 * any unexpected failure is wrapped as `DecodeFailed`, so callers can switch
 * on `kind` exhaustively.
 */

export type UploadErrorKind =
  | "FileTooLarge"
  | "BadMime"
  | "HeicConvertFailed"
  | "HeicSupportMissing"
  | "DecodeFailed";

const DEFAULT_MESSAGES: Record<UploadErrorKind, string> = {
  FileTooLarge: "The image is too large.",
  BadMime: "That file type isn't supported.",
  HeicConvertFailed: "Couldn't convert the HEIC image.",
  HeicSupportMissing:
    "HEIC support is not installed. Add the optional `heic2any` dependency.",
  DecodeFailed: "Couldn't read the image.",
};

/**
 * Stable, dot-namespaced keys you can map to your own localized copy. They
 * never change across releases, so they're safe to use as i18n lookup keys.
 */
const MESSAGE_KEYS: Record<UploadErrorKind, string> = {
  FileTooLarge: "imageGuard.error.fileTooLarge",
  BadMime: "imageGuard.error.badMime",
  HeicConvertFailed: "imageGuard.error.heicConvertFailed",
  HeicSupportMissing: "imageGuard.error.heicSupportMissing",
  DecodeFailed: "imageGuard.error.decodeFailed",
};

export class UploadValidationError extends Error {
  /** Machine-readable failure reason — switch on this. */
  readonly kind: UploadErrorKind;
  /** Stable i18n key mapping to your own translated message. */
  readonly messageKey: string;

  constructor(kind: UploadErrorKind, cause?: unknown) {
    super(DEFAULT_MESSAGES[kind], cause === undefined ? undefined : { cause });
    this.name = "UploadValidationError";
    this.kind = kind;
    this.messageKey = MESSAGE_KEYS[kind];
    // Restore the prototype chain for `instanceof` when compiled down to ES5.
    Object.setPrototypeOf(this, UploadValidationError.prototype);
  }
}

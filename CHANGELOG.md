# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-12

### Added

- Initial release.
- `processImage(file, options)` — validate, normalize, and compress a
  user-selected image into a clean JPEG `File` ready for `FormData`. Pipeline:
  raw-size guard → magic-byte sniff → HEIC/HEIF conversion → MIME whitelist →
  compression + resize + EXIF strip (Web Worker with main-thread fallback) →
  hard size assertion → filename sanitization.
- `convertHeicToJpeg(file)` — standalone HEIC/HEIF to JPEG conversion via the
  optional `heic2any` peer dependency (lazy-loaded).
- `UploadValidationError` — the single typed error, with a machine-readable
  `kind` and a stable `messageKey` for i18n.
- Exported default constraints: `ALLOWED_UPLOAD_MIMES`, `MAX_UPLOAD_BYTES`,
  `MAX_INPUT_BYTES`, and the `AllowedUploadMime` type.

[0.1.0]: https://github.com/raiez-alshamaly/browser-image-guard/releases/tag/v0.1.0

# browser-image-guard

[![npm version](https://img.shields.io/npm/v/browser-image-guard.svg)](https://www.npmjs.com/package/browser-image-guard)
[![CI](https://github.com/raiez-alshamaly/browser-image-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/raiez-alshamaly/browser-image-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Types: included](https://img.shields.io/badge/Types-included-blue.svg)](./dist/index.d.ts)

Harden browser image uploads in **one call**. `processImage(file)` takes a
user-selected `File` and returns a clean, compressed JPEG `File` ready to append
to `FormData` — or throws a typed error you can map to your own UI copy.

Most apps hand-roll this and get it subtly wrong: they trust `file.type` (which
is spoofable), ship EXIF/GPS metadata to the server, choke on iPhone HEIC, or
hang forever on older mobile browsers that can't compress in a Web Worker. This
library does the boring, correct thing for all of it.

## What it does

For every image, in order:

1. **Early size guard** on the raw input — avoids OOM-ing the decode on cheap devices.
2. **Magic-byte sniffing** via [`file-type`](https://github.com/sindresorhus/file-type) — the real bytes decide the type, never the spoofable `file.type` or the extension.
3. **HEIC / HEIF → JPEG** conversion (lazy-loaded, so the WASM only ships when a user actually picks a HEIC).
4. **MIME whitelist** check after conversion.
5. **Compression + resize + EXIF/GPS strip + orientation fix** via [`browser-image-compression`](https://github.com/Donaldcwl/browser-image-compression), in a Web Worker where supported — **with an automatic main-thread fallback** for older iOS Safari and browsers without `OffscreenCanvas`, so it never hangs on a spinner.
6. **Hard size assertion** against your output cap.
7. **Filename sanitization** — strips path-traversal and injection characters, forces `.jpg`.

## Install

```sh
npm install browser-image-guard browser-image-compression file-type
# Optional — only if you need to accept iPhone HEIC uploads:
npm install heic2any
```

`browser-image-compression` and `file-type` are peer dependencies. `heic2any` is
an **optional** peer dependency: install it only if you want HEIC support. If a
HEIC lands and it isn't installed, you get a clean `HeicSupportMissing` error
instead of a crash.

## Usage

```ts
import { processImage, UploadValidationError } from "browser-image-guard";

async function onFileSelected(file: File) {
  try {
    const jpeg = await processImage(file);
    const body = new FormData();
    body.append("image", jpeg);
    await fetch("/api/upload", { method: "POST", body });
  } catch (err) {
    if (err instanceof UploadValidationError) {
      // Map the machine-readable kind to your own localized message.
      showToast(messagesForYourLocale[err.messageKey]);
    } else {
      throw err;
    }
  }
}
```

### Options

```ts
await processImage(file, {
  maxBytes: 5 * 1024 * 1024,       // HARD output cap — the only size that rejects
  targetBytes: 2 * 1024 * 1024,    // SOFT compression target (advisory, won't reject)
  maxInputBytes: 32 * 1024 * 1024, // largest raw input accepted into the decoder
  allowedMimes: ["image/jpeg", "image/png", "image/webp"],
  maxWidthOrHeight: 1920,          // longest-edge cap in pixels
  initialQuality: 0.85,            // JPEG quality search seed (0–1)
  workerLibURL: "/assets/browser-image-compression.js", // for strict CSP, see below
});
```

**`maxBytes` vs `targetBytes`** — this distinction matters. `maxBytes` is the
hard ceiling: exceed it and the file is rejected. `targetBytes` is a *soft*
target handed to the compressor; it aims for it but may overshoot on noisy
inputs (detailed photos, text-heavy documents), and that overshoot is fine as
long as it stays under `maxBytes`. **Don't** lower `maxBytes` to make uploads
smaller — you'll bounce valid photos the compressor simply couldn't squeeze that
far. Lower `targetBytes` instead.

## Errors

Every failure is an `UploadValidationError` with a typed `kind`:

| `kind`               | Meaning                                                        |
| -------------------- | ------------------------------------------------------------- |
| `FileTooLarge`       | Raw input over `maxInputBytes`, or output over `maxBytes`.    |
| `BadMime`            | Sniffed type not in `allowedMimes`.                           |
| `HeicConvertFailed`  | A HEIC was detected but conversion failed.                    |
| `HeicSupportMissing` | A HEIC was detected but the optional `heic2any` isn't installed. |
| `DecodeFailed`       | Any other unexpected failure (wrapped, never leaked raw).     |

Each error also carries a stable `messageKey` (e.g. `imageGuard.error.badMime`)
you can wire straight into an i18n dictionary.

## Content Security Policy note

`browser-image-compression` loads itself inside a Web Worker via `importScripts`
from a CDN by default. If your `script-src` CSP blocks that (e.g. `script-src
'self'`), self-host the library and pass its URL as `workerLibURL`. With a
bundler that supports URL imports:

```ts
import workerUrl from "browser-image-compression/dist/browser-image-compression.js?url";

await processImage(file, { workerLibURL: workerUrl });
```

The worker path is only an optimization — if it fails for any reason, the
pipeline automatically falls back to compressing on the main thread.

## License

MIT

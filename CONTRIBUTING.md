# Contributing

Thanks for your interest in improving `browser-image-guard`. Contributions of
all kinds are welcome — bug reports, docs, and code.

## Development setup

```sh
git clone https://github.com/raiez-alshamaly/browser-image-guard.git
cd browser-image-guard
npm install
```

## Useful scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm test`          | Run the Vitest suite once.                    |
| `npm run test:watch`| Run the tests in watch mode.                  |
| `npm run typecheck` | Type-check with `tsc --noEmit`.               |
| `npm run build`     | Build the ESM bundle + type declarations.     |

Please make sure `npm run typecheck`, `npm test`, and `npm run build` all pass
before opening a pull request. CI runs the same three on Node 18, 20, and 22.

## Commit messages

This project uses [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:` …). Keep the subject
short and describe the "why" in the body when it isn't obvious.

## Adding a new accepted format

The MIME whitelist lives in `src/constraints.ts`. Anything you add there must be
something `browser-image-compression` can actually re-encode, and the final
output is always JPEG. If you need to accept a format the decoder can't read
natively (like HEIC), add a conversion step in `processImage.ts` the way HEIC is
handled.

## Reporting bugs

Open an issue with a minimal reproduction: the input file characteristics
(type, size), the options you passed, the `UploadValidationError.kind` you got
(or the unexpected result), and your browser/OS.

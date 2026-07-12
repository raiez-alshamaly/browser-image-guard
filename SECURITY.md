# Security Policy

## Supported versions

The latest published `0.x` release receives security fixes.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report vulnerabilities privately via GitHub's
[security advisories](https://github.com/raiez-alshamaly/browser-image-guard/security/advisories/new),
or by email to raiez.shamaly@gmail.com.

Please include a description of the issue, a reproduction, and the impact. You
can expect an acknowledgement within a few days.

## Scope

This library validates and normalizes untrusted user-selected images entirely
in the browser. It is a defense-in-depth layer, **not** a replacement for
server-side validation: always re-validate size, type, and content on the
server, since anything running in the browser can be bypassed by a determined
client.

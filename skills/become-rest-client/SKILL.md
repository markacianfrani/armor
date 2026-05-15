---
name: become-rest-client
description: >
  Become a REST client and QA a live API against its spec. Spawns subagents to
  hit the server with real requests, finds gaps where the spec lies, and
  compiles feedback. Use when auditing or hammering an existing API
  implementation against its OpenAPI/Swagger contract.
arguments: [spec, server, details]
argument-hint: <spec> <server> <details>
metadata:
  author: Mark Anthony Cianfrani
  version: "0.2.0"
---

Audit `$server` against spec `$spec` using only the spec as your map. `$details` may narrow scope.

## Set up

Pick a kebab-case `$NAME` from the spec's `info.title`, then:

```bash
./scripts/ensure-restish.sh
./scripts/init-api.sh --name "$NAME" --spec "$spec" --base "$server"
# init refuses if "$NAME" already exists; switch to update-api.sh if so
```

`restish $NAME --help` now lists every operation grouped by tag.

## Audit

Group operations by tag. In one message, spawn a parallel Agent per tag. Each subagent gets the API name, its operation list, auth (existing profile or a bearer via `-H authorization:...`), and this checklist:

1. `restish <name> <op> --help` — required flags match the spec?
2. Happy-path request with realistic values — status, headers, body match the documented schema?
3. One or two documented error responses — does the server actually return them?
4. Report findings as `<op> — expected — actual — severity`. Structured, ~300 words max.

## Compile

Group findings as **spec lies** (server contradicts spec), **spec gaps** (server returns undocumented things), **server bugs** (violates own spec), **ambiguities** (spec silent). Link each to the operation. The user files tickets from this.

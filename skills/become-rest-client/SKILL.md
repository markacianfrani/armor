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
  version: "0.3.0"
---

Audit `$server` against spec `$spec` using only the spec as your map. `$details` may narrow scope.

Requires **Restish v2** (`./scripts/ensure-restish.sh` checks and installs it). v1 kept each API
in `~/Library/Application Support/restish/apis.json`; v2 uses one config at
`~/.config/restish/restish.json` (honoring `$XDG_CONFIG_HOME` and `$RSH_CONFIG`) and migrates v1
away, so never hand-edit the v1 path. The scripts call `restish api …` instead of writing config
so this keeps working across releases.

## Set up

Pick a kebab-case `$NAME` from the spec's `info.title`, then:

```bash
./scripts/ensure-restish.sh
./scripts/init-api.sh --name "$NAME" --spec "$spec" --base "$server"
# init refuses if "$NAME" already exists; switch to update-api.sh if so
```

`restish $NAME --help` now lists every operation grouped by tag.

Notes:

- `$server` must be an absolute origin. A `servers[].url` of `/` is a path, not a host — pass
  `--base https://host`. Prefer https: an `http://` base is usually 301'd, and clients that
  follow a 301 with a GET drop the body, which surfaces as a spurious 401 on endpoints that
  need no auth at all. Always confirm the scheme before believing an auth failure.
- If the spec's security is a **document-level default**, `api connect` demands a token up
  front. Either pass `--bearer-env <VAR>` (stored unresolved as `env:<VAR>`, so no secret ever
  hits disk) or let the script fall back to registering without auth and pass
  `-H "authorization: Bearer <token>"` per request. `restish api auth inspect "$NAME"` reports
  which secured operations are actually callable.
- After editing the spec file on disk, re-run `./scripts/update-api.sh --name "$NAME" --spec "$spec"`
  (or `restish api sync "$NAME"`). Setting `base_url` or `spec_files` invalidates the cached
  operation list, so it reports "0 operations" until a sync.

## Audit

Group operations by tag. In one message, spawn a parallel Agent per tag. Each subagent gets the API
name, its operation list, auth (existing profile, a `--bearer-env` profile, or a bearer via
`-H authorization:...`), the boundaries it owns, and this checklist:

1. `restish <name> <op> --help` — required flags match the spec?
2. Happy-path request with realistic values — status, headers, body match the documented schema?
   Walk nested properties: types, nullability, enums, required.
3. One or two documented error responses — does the server actually return them? Then try the
   obvious undocumented case: missing required field, bad enum value, no token.
4. Report findings as `<op> — expected — actual — severity`. Structured, ~300 words max.

When the API is a state machine keyed by a session (token, cart, conversation), drive it once
yourself
to establish state before fanning out, give every agent the same session, and assign **one writer
per piece of state** — parallel agents that mutate the same record corrupt each other and produce
findings that were never true. Say explicitly which operations each agent must not call, and have
it restore anything it changed.

## Compile

Group findings as **spec lies** (server contradicts spec), **spec gaps** (server returns
undocumented things), **server bugs** (violates own spec), **ambiguities** (spec silent). Link each
to the operation. The user files tickets from this.

Where the deliverable is a better spec, apply the corrections to the spec file and then prove them:
re-parse it, confirm every `$ref` resolves and no illegal keywords slipped in (in OpenAPI 3.0
write `nullable: true`, never `type: "null"`), sync it back into the client, and re-check the
corrected claims against the live server rather than shipping them on reasoning alone.

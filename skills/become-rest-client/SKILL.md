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
  version: "0.0.1"
---

become REST client. interact with the system using only the provided API spec $spec. spawn multiple subagents, do real world examples against $server. we're trying to audit and hammer the existing implementation and find any gaps where the spec lies… basically QA this and compile a list of feedback

$details

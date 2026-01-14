---
name: jira
description: Use this skill whenever you need to interface with Jira. For example, when the user asks to "make a ticket", "create a JIRA ticket", "file a ticket for this", "log this in JIRA", or mentions needing to interact with JIRA in any way. Also triggers on phrases like "turn this into a ticket" or "we should track this".
compatibility: Requires acli and access to the internet
---

# JIRA Ticket Management

Interact with JIRA using the Atlassian CLI (`acli`).

## Prerequisites

Before creating tickets, verify `acli` is installed and authenticated:

```bash
acli --version
```

If not installed or authenticated, direct the user to:
- Install: https://developer.atlassian.com/cloud/acli/guides/introduction
- Run `acli --help` for authentication setup

## Finding the Project Key

1. Check the repo's `AGENTS.md` or `CLAUDE.md` for a `jira_project_key` or similar
2. If not found, ask the user for the project key
3. After the user provides it, add it to the project's `CLAUDE.md` for future reference:
   ```markdown
   ## JIRA
   Project Key: PROJ
   ```

## Creating Tickets

Use `--from-json` with ADF (Atlassian Document Format) for proper formatting:

```bash
cat > /tmp/ticket.json << 'EOF'
{
  "projectKey": "PROJECT_KEY",
  "type": "Story",
  "summary": "Implement Configuration Validation",
  "description": {
    "version": 1,
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [{ "type": "text", "text": "Description text here." }]
      },
      {
        "type": "heading",
        "attrs": { "level": 2 },
        "content": [{ "type": "text", "text": "Definition of Done" }]
      },
      {
        "type": "bulletList",
        "content": [
          { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Outcome 1" }] }] },
          { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Outcome 2" }] }] }
        ]
      }
    ]
  }
}
EOF
acli jira workitem create --from-json /tmp/ticket.json
```

**Important:** The `--description` flag only accepts plain text (no formatting). Use `--from-json` with ADF for headings, bullets, etc. Markdown and wiki syntax do NOT work.

### ADF Quick Reference

```json
// Paragraph
{ "type": "paragraph", "content": [{ "type": "text", "text": "..." }] }

// Heading (level 1-6)
{ "type": "heading", "attrs": { "level": 2 }, "content": [{ "type": "text", "text": "..." }] }

// Bullet list
{ "type": "bulletList", "content": [
  { "type": "listItem", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "..." }] }] }
]}

// Bold text
{ "type": "text", "text": "...", "marks": [{ "type": "strong" }] }
```

Docs: https://developer.atlassian.com/cloud/jira/platform/apis/document/structure/

## Editing Tickets

Use `--from-json` with `issues` array:

```bash
cat > /tmp/edit.json << 'EOF'
{
  "issues": ["PROJ-123"],
  "description": { "version": 1, "type": "doc", "content": [...] }
}
EOF
acli jira workitem edit --from-json /tmp/edit.json --yes
```

## Ticket Types

| Type | Use For |
|------|---------|
| Story | Code changes, new features |
| Task | Documentation, config, non-code work |
| Bug | Defects in existing functionality |

## Ticket Template

### Title
- Imperative verb + specific object + context
- Under 60 characters
- Examples:
  - ✅ `Implement Configuration Validation with Pydantic`
  - ✅ `Switch Auto Loader to File Notification Mode`
  - ❌ `Configuration` (no verb)
  - ❌ `URGENT: CRITICAL BUG` (use Priority field instead)

Common verbs: Implement, Add, Switch, Remove, Update, Fix, Migrate, Refactor

### Description
1-3 sentences covering **what** and **why**.

✅ Good:
> Implement Pydantic models for config files to catch validation errors at startup. Currently getting silent failures on typos.

❌ Bad:
> Add validation (no context)

### Definition of Done
Bullet list of **specific, measurable outcomes** (not implementation steps).

✅ Good (outcomes):
- Config files validate on startup
- Invalid configs produce clear error with field name
- All existing configs pass validation
- Unit tests cover each config type

❌ Bad (implementation steps):
- Use Pydantic BaseModel
- Create schema for each file
- Add try/catch blocks

DoD guidelines:
- 3-7 items (if more, split the story)
- Outcome-focused, not prescriptive
- Include code, tests, and docs where relevant
- Specific enough to verify completion

### Implementation Details (Optional)
Use for context that helps but doesn't belong in DoD:
- Documentation links
- Technical constraints
- Permission requirements
- Related tickets

✅ Good:
> See Databricks docs: [link]
> Requires S3:PutBucketNotification permission
> Related: FOO-823

❌ Bad:
> Step 1: Create the file. Step 2: Add imports...

## Sizing Check

Before creating, verify the story fits one sprint. If the DoD has more than 7 items or the scope feels large, suggest splitting into multiple tickets.

## Other Commands

Discover additional commands via:
```bash
acli jira --help
acli jira workitem --help
```

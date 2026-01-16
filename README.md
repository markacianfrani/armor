# Armor 

All my little AI snippets. Likely will be trashed in 6 months like my cursorrules. 

## CC To Opencode WIP

### Default (migrates .claude to .opencode)
```bash
bun run migrate
```

## What gets migrated

- **Agents**: Creates `.opencode/agent/*.md` files (OpenCode-compatible markdown)
- **MCP Servers**: Creates `.opencode/opencode.json` with MCP config

## Output

The script generates:
- `.opencode/agent/*.md` - Agent definitions in OpenCode markdown format
- `.opencode/opencode.json` - MCP server configuration only

Your `.claude/` directory remains unchanged, allowing you to use both platforms from the same source configs.

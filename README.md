# Claude to OpenCode Migrator

Migrate your Claude Desktop configuration to OpenCode format.

## Usage

### Default (migrates .claude to .opencode)
```bash
bun run migrate
```

### Custom directories
```bash
bun run migrate /path/to/.claude /path/to/.opencode
```

### Direct script execution
```bash
bun migrate-claude-to-opencode.ts
```

## What gets migrated

- **Agents**: Creates `.opencode/agent/*.md` files (OpenCode-compatible markdown)
- **MCP Servers**: Creates `.opencode/opencode.json` with MCP config

## What's NOT migrated

- **Skills**: OpenCode already reads from `.claude/skills/` - no migration needed!
- **Plugins**: Different APIs between platforms

## Output

The script generates:
- `.opencode/agent/*.md` - Agent definitions in OpenCode markdown format
- `.opencode/opencode.json` - MCP server configuration only

Your `.claude/` directory remains unchanged, allowing you to use both platforms from the same source configs.
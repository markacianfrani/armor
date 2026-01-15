#!/usr/bin/env bun

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'fs'
import { join, dirname, basename, extname } from 'path'

type ClaudeConfig = {
  mcpServers?: Record<string, {
    command?: string
    args?: string[]
    env?: Record<string, string>
    url?: string
  }>
}

type ClaudeAgent = {
  name: string
  instructions?: string
  tools?: string[]
  model?: string
}



function agentToMarkdown(claudeAgent: ClaudeAgent, agentName: string): string {
  const lines: string[] = ['---']
  
  lines.push(`description: ${claudeAgent.instructions?.split('\n')[0] || claudeAgent.name}`)
  lines.push('mode: subagent')
  
  if (claudeAgent.model) {
    lines.push(`model: ${claudeAgent.model}`)
  }
  
  if (claudeAgent.tools && claudeAgent.tools.length > 0) {
    lines.push('tools:')
    claudeAgent.tools.forEach(tool => {
      if (typeof tool === 'string') {
        lines.push(`  ${tool}: true`)
      }
    })
  }
  
  lines.push('---')
  
  if (claudeAgent.instructions) {
    lines.push('')
    lines.push(claudeAgent.instructions)
  }
  
  return lines.join('\n')
}

function transformMCP(claudeMCP: ClaudeConfig['mcpServers'][string]): any {
  if (!claudeMCP) return null

  const mcp: any = {}

  if (claudeMCP.url) {
    mcp.type = 'remote'
    mcp.url = claudeMCP.url
  } else if (claudeMCP.command) {
    mcp.type = 'local'
    mcp.command = claudeMCP.args 
      ? [claudeMCP.command, ...claudeMCP.args]
      : [claudeMCP.command]
  }

  if (claudeMCP.env && Object.keys(claudeMCP.env).length > 0) {
    mcp.environment = {}
    for (const [key, value] of Object.entries(claudeMCP.env)) {
      mcp.environment[key] = value
    }
  }

  return mcp
}

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}



async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: migrate-claude-to-opencode [source-dir] [target-dir]

Arguments:
  source-dir    Path to Claude config directory (default: .claude)
  target-dir    Path to OpenCode config directory (default: .opencode)

Options:
  --help, -h    Show this help message

This script migrates your Claude configuration to OpenCode:
- Agents: Creates OpenCode agent markdown files
- MCP: Transforms Claude MCP servers to OpenCode format
- Skills: Skipped (OpenCode already reads from .claude/skills/)
`)
    process.exit(0)
  }

  const sourceDir = args[0] || '.claude'
  const targetDir = args[1] || '.opencode'

  console.log(`Migrating from ${sourceDir} to ${targetDir}`)

  if (!existsSync(sourceDir)) {
    console.error(`Source directory ${sourceDir} does not exist`)
    process.exit(1)
  }

  ensureDir(targetDir)

  const configPath = join(sourceDir, 'claude_desktop_config.json')
  let opencodeConfig: any = {
    $schema: 'https://opencode.ai/config.json',
    mcp: {},
  }

  if (existsSync(configPath)) {
    console.log('\nReading Claude config...')
    const claudeConfig: ClaudeConfig = JSON.parse(readFileSync(configPath, 'utf-8'))

    if (claudeConfig.mcpServers) {
      console.log('\nTransforming MCP servers...')
      for (const [name, mcp] of Object.entries(claudeConfig.mcpServers)) {
        const transformed = transformMCP(mcp)
        if (transformed) {
          opencodeConfig.mcp[name] = { ...transformed, enabled: true }
          console.log(`  MCP: ${name}`)
        }
      }
    }
  }

  const agentsDir = join(sourceDir, 'agents')
  const agentTargetDir = join(targetDir, 'agent')
  if (existsSync(agentsDir)) {
    console.log('\nTransforming agents...')
    ensureDir(agentTargetDir)
    
    const agentFiles = readdirSync(agentsDir)

    for (const file of agentFiles) {
      const ext = extname(file)
      const agentName = basename(file, ext)

      if (ext === '.json' || ext === '.md') {
        const agentPath = join(agentsDir, file)
        let agent: ClaudeAgent

        try {
          if (ext === '.json') {
            agent = JSON.parse(readFileSync(agentPath, 'utf-8'))
          } else {
            const content = readFileSync(agentPath, 'utf-8')
            const [frontmatter, ...rest] = content.split('---')
            
            agent = {
              name: agentName,
            }

            const lines = frontmatter.trim().split('\n')
            for (const line of lines) {
              const match = line.match(/^(\w+):\s*(.+)$/)
              if (match) {
                const [, key, value] = match
                if (key === 'instructions') {
                  agent.instructions = value
                } else if (key === 'model') {
                  agent.model = value
                } else if (key === 'tools') {
                  agent.tools = value.split(',').map(t => t.trim())
                }
              }
            }

            if (rest.length > 0) {
              agent.instructions = rest.join('\n').trim()
            }
          }

          const markdown = agentToMarkdown(agent, agentName)
          writeFileSync(join(agentTargetDir, `${agentName}.md`), markdown)
          console.log(`  Agent: ${agentName}`)
        } catch (err) {
          console.log(`  Skipped ${file}: ${(err as Error).message}`)
        }
      }
    }
  }

  if (Object.keys(opencodeConfig.mcp).length > 0) {
    const configPath = join(targetDir, 'opencode.json')
    writeFileSync(configPath, JSON.stringify(opencodeConfig, null, 2))
    console.log(`\nWrote OpenCode config to ${configPath}`)
  }

  console.log('\n✅ Migration complete!')
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
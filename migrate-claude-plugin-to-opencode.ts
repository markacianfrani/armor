#!/usr/bin/env bun

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'fs'
import { join, dirname, basename, extname } from 'path'
import { homedir } from 'os'

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

function colorToHex(color: string): string {
  const colorMap: Record<string, string> = {
    'red': '#ff0000',
    'green': '#00ff00',
    'blue': '#0000ff',
    'yellow': '#ffff00',
    'orange': '#ff8800',
    'purple': '#8800ff',
    'pink': '#ff0088',
    'cyan': '#00ffff',
    'white': '#ffffff',
    'black': '#000000',
    'gray': '#808080',
    'grey': '#808080',
  }

  const lowerColor = color.toLowerCase()
  if (colorMap[lowerColor]) {
    return colorMap[lowerColor]
  }
  if (color.startsWith('#')) {
    return color
  }
  return color
}

function transformTools(toolsLine: string): string | null {
  const match = toolsLine.match(/^tools:\s*(.+)$/)
  if (!match) return null

  const toolsList = match[1].split(',').map(t => t.trim())
  const yamlTools = toolsList.map(t => `  ${t}: true`).join('\n')

  return 'tools:\n' + yamlTools
}

function transformMarkdown(sourcePath: string, targetPath: string, isAgent: boolean) {
  const content = readFileSync(sourcePath, 'utf-8')
  const parts = content.split('---')

  if (parts.length < 2) {
    copyFileSync(sourcePath, targetPath)
    return
  }

  const frontmatter = parts[1]
  const body = parts.slice(2).join('---')
  const lines = frontmatter.trim().split('\n')

  let transformed = []
  let hasMode = false

  for (const line of lines) {
    if (line.startsWith('tools:')) {
      const transformedTools = transformTools(line)
      if (transformedTools) {
        transformed.push(transformedTools)
      } else {
        transformed.push(line)
      }
    } else if (line.startsWith('color:')) {
      const match = line.match(/^color:\s*(.+)$/)
      if (match) {
        const hexColor = colorToHex(match[1].trim())
        transformed.push(`color: '${hexColor}'`)
      } else {
        transformed.push(line)
      }
    } else if (line.startsWith('mode:')) {
      hasMode = true
      transformed.push(line)
    } else if (!line.startsWith('model:')) {
      transformed.push(line)
    }
  }

  if (isAgent && !hasMode) {
    transformed.push('mode: subagent')
  }

  const newContent = '---\n' + transformed.join('\n') + '\n---\n' + body
  writeFileSync(targetPath, newContent)
}

function copyDir(source: string, target: string, isAgentDir: boolean = false) {
  if (!existsSync(source)) {
    console.log(`  Skipped ${source}: directory does not exist`)
    return
  }

  ensureDir(target)
  const files = readdirSync(source)

  for (const file of files) {
    const sourcePath = join(source, file)
    const targetPath = join(target, file)
    const stat = require('fs').statSync(sourcePath)

    if (stat.isDirectory()) {
      copyDir(sourcePath, targetPath, isAgentDir)
    } else if (extname(file) === '.md') {
      transformMarkdown(sourcePath, targetPath, isAgentDir)
    } else {
      copyFileSync(sourcePath, targetPath)
    }
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: migrate-claude-plugin-to-opencode [source-dir] [target-dir]

Arguments:
  source-dir    Path to Claude plugin directory (default: current directory)
  target-dir    Path to OpenCode config directory (default: ~/.config/opencode)

Options:
  --help, -h    Show this help message

This script migrates a Claude Code plugin to OpenCode:
- Agents: Copies from agents/ to .opencode/agent/
- Commands: Copies from commands/ to .opencode/commands/
- Skills: Copies from skills/ to .claude/skills/ (OpenCode reads from there)
`)
    process.exit(0)
  }

  const sourceDir = args[0] || '.'
  const targetDir = args[1] || join(homedir(), '.config', 'opencode')
  const claudeDir = join(homedir(), '.claude')

  console.log(`Migrating from ${sourceDir} to ${targetDir}`)

  if (!existsSync(sourceDir)) {
    console.error(`Source directory ${sourceDir} does not exist`)
    process.exit(1)
  }

  ensureDir(targetDir)
  ensureDir(claudeDir)

  console.log('\nCopying agents...')
  copyDir(join(sourceDir, 'agents'), join(targetDir, 'agent'), true)

  console.log('\nCopying commands...')
  copyDir(join(sourceDir, 'commands'), join(targetDir, 'commands'))

  console.log('\nCopying skills...')
  copyDir(join(sourceDir, 'skills'), join(claudeDir, 'skills'))

  console.log('\n✅ Migration complete!')
  console.log(`  Agents: ${join(targetDir, 'agent')}`)
  console.log(`  Commands: ${join(targetDir, 'commands')}`)
  console.log(`  Skills: ${join(claudeDir, 'skills')}`)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})

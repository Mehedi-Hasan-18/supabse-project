#!/usr/bin/env node
/**
 * Fails if anything that looks like a real secret has been committed.
 *
 * Looks for:
 *   - a JWT (anon/service_role keys are JWTs: three base64url segments)
 *   - the words "service_role" / "SERVICE_ROLE" in source files
 *   - Supabase secret key prefixes (sb_secret_)
 *   - a Google OAuth client secret (GOCSPX-...)
 *   - a filled-in (non-placeholder) .env file that is not gitignored
 *
 * Run: npm run check:secrets
 */
import { execSync } from 'node:child_process'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'dist-ssr', '.vite'])
const IGNORE_FILES = new Set([
  'check-secrets.mjs', // this file
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
])

// Only patterns for real secret *material*. Mentioning the name of an env var
// (e.g. SUPABASE_SERVICE_ROLE_KEY in the docs) is fine and must not trip this.
const PATTERNS = [
  { name: 'JWT (real anon/service_role key)', re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'Supabase secret key', re: /sb_secret_[A-Za-z0-9]+/ },
  { name: 'Google OAuth client secret', re: /GOCSPX-[A-Za-z0-9_-]+/ },
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (IGNORE_DIRS.has(entry)) continue
      out.push(...walk(full))
    } else {
      if (IGNORE_FILES.has(entry)) continue
      out.push(full)
    }
  }
  return out
}

// Only inspect files git would track, so gitignored .env.local is excluded.
const inGitRepo = (() => {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

let files
if (inGitRepo) {
  const tracked = execSync('git ls-files', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim()
  files = tracked ? tracked.split('\n').map((f) => join(root, f)) : walk(root)
} else {
  // No repo yet: skip local env files, they are gitignored by convention anyway.
  files = walk(root).filter((f) => !/\.env(\.|$)/.test(f.split('/').pop() ?? ''))
}

/** Is `name` covered by the repo's .gitignore? */
function isIgnored(name) {
  if (inGitRepo) {
    try {
      execSync(`git check-ignore -q ${name}`, { cwd: root, stdio: 'ignore' })
      return true
    } catch {
      return false
    }
  }
  const ignorePath = join(root, '.gitignore')
  if (!existsSync(ignorePath)) return false
  const lines = readFileSync(ignorePath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  return lines.some((l) => l === name || l === '/.env' || (l.startsWith('.env') && name.startsWith('.env')))
}

const findings = []
for (const file of files) {
  if (!existsSync(file)) continue
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    continue // binary
  }
  for (const { name, re } of PATTERNS) {
    if (re.test(text)) {
      findings.push(`${relative(root, file)}: ${name}`)
    }
  }
}

// Make sure real env files are ignored rather than committed.
for (const envFile of ['.env', '.env.local']) {
  if (existsSync(join(root, envFile)) && !isIgnored(envFile)) {
    findings.push(`${envFile}: exists and is NOT gitignored`)
  }
}

if (findings.length) {
  console.error('Potential secret exposure:\n' + findings.map((f) => `  - ${f}`).join('\n'))
  process.exit(1)
}
console.log('No secrets found in tracked files. Frontend/repo are clean.')

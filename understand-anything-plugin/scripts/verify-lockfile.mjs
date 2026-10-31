#!/usr/bin/env node
/**
 * Supply-chain gate for the plugin install.
 *
 * pnpm verifies each downloaded tarball against the `integrity` hash stored in
 * pnpm-lock.yaml, but it accepts entries that have no hash at all (git or
 * tarball resolutions). A tampered lockfile could therefore swap a package for
 * an arbitrary URL. This script refuses the install unless every package in the
 * lockfile:
 *   - has a sha512 integrity hash, and
 *   - resolves from the public npm registry (no git, tarball or file sources).
 * It also checks that `pnpm-workspace.yaml` only allows build scripts for the
 * packages listed in ALLOWED_BUILDS.
 *
 * Usage: node scripts/verify-lockfile.mjs [plugin-root]
 * Exit code 0 = OK, 1 = problem found (details on stderr).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] ?? new URL('..', import.meta.url).pathname);
const lock = readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8');
const problems = [];

if (!/^lockfileVersion: '9\.\d+'/m.test(lock)) {
  problems.push('unexpected lockfileVersion (expected 9.x)');
}

const packagesSection = lock.split(/\npackages:\n/)[1]?.split(/\nsnapshots:\n/)[0];
if (!packagesSection) {
  problems.push('could not find the "packages:" section of pnpm-lock.yaml');
} else {
  // Each entry starts with two spaces of indentation followed by a key.
  const entries = packagesSection.split(/\n(?=  \S)/).filter((e) => e.trim());
  for (const entry of entries) {
    const name = entry.split('\n')[0].trim().replace(/:$/, '');
    const resolution = entry.match(/resolution:\s*\{([^}]*)\}/)?.[1] ?? '';
    if (/\b(tarball|repo|commit|directory|type):/.test(resolution)) {
      problems.push(`${name}: non-registry resolution {${resolution.trim()}}`);
      continue;
    }
    if (!/integrity:\s*sha512-[A-Za-z0-9+/]+=*/.test(resolution)) {
      problems.push(`${name}: missing sha512 integrity hash`);
    }
  }
  if (entries.length === 0) problems.push('lockfile lists no packages');
  else console.log(`lockfile: ${entries.length} packages, all sha512-pinned to the npm registry`);
}

const ALLOWED_BUILDS = new Set([
  '@tree-sitter-grammars/tree-sitter-kotlin', 'esbuild', 'tree-sitter-c', 'tree-sitter-c-sharp',
  'tree-sitter-cpp', 'tree-sitter-go', 'tree-sitter-java', 'tree-sitter-javascript',
  'tree-sitter-php', 'tree-sitter-python', 'tree-sitter-ruby', 'tree-sitter-rust',
  'tree-sitter-scala', 'tree-sitter-typescript',
]);
const workspace = readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8');
const allowBuilds = workspace.split(/\nallowBuilds:\n/)[1] ?? '';
for (const m of allowBuilds.matchAll(/^\s+'?([^'\s:]+)'?:\s*true/gm)) {
  if (!ALLOWED_BUILDS.has(m[1])) problems.push(`pnpm-workspace.yaml allows build scripts for unexpected package "${m[1]}"`);
}

if (problems.length) {
  console.error('Supply-chain check FAILED:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('Supply-chain check passed.');

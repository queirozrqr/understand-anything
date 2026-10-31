import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

function readRepoFile(relPath) {
  return readFileSync(resolve(repoRoot, relPath), 'utf-8');
}

describe('skill command hardening', () => {
  it('quotes PROJECT_ROOT in shell command snippets', () => {
    const files = [
      'understand-anything-plugin/skills/understand/SKILL.md',
    ];

    const unsafePatterns = [
      /\b(?:node|python|python3|mkdir|find|rm|cat)\s+(?:-[^\n]*\s+)*\$PROJECT_ROOT\b/,
      />\s*\$PROJECT_ROOT\b/,
      /--changed-files=\$PROJECT_ROOT\b/,
      /rm\s+-rf\s+\$PROJECT_ROOT\b/,
    ];

    for (const relPath of files) {
      const content = readRepoFile(relPath);
      for (const pattern of unsafePatterns) {
        expect(content, `${relPath} should not contain ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it('quotes skill and target directory placeholders in knowledge commands', () => {
    const content = readRepoFile('understand-anything-plugin/skills/understand-knowledge/SKILL.md');

    expect(content).not.toMatch(/python3\s+<SKILL_DIR>\/[^\n]+ <TARGET_DIR>/);
    expect(content).not.toMatch(/rm\s+-rf\s+<TARGET_DIR>/);
  });


  it('quotes dashboard cd targets and GRAPH_DIR assignment', () => {
    const content = readRepoFile('understand-anything-plugin/skills/understand-dashboard/SKILL.md');

    expect(content).not.toMatch(/<(?:dashboard-dir|plugin-root|project-dir)>/);
    expect(content).not.toMatch(/\bcd <(?:dashboard-dir|plugin-root)>/);
    expect(content).not.toMatch(/GRAPH_DIR=<project-dir>/);
    expect(content).toMatch(/PROJECT_DIR=\$\(pwd -P\)/);
    expect(content).toMatch(/UA_DIR="\$PROJECT_DIR\/\.understand-anything"/);
    expect(content).toMatch(/\[ ! -f "\$UA_DIR\/knowledge-graph\.json" \]/);
    expect(content).toMatch(/DASHBOARD_DIR="\$PLUGIN_ROOT\/packages\/dashboard"/);
    expect(content).toMatch(/: "\$\{PLUGIN_ROOT:\?Run step 3 first so PLUGIN_ROOT is set\}"/);
    expect(content).toMatch(/: "\$\{PROJECT_DIR:\?Run step 1 first so PROJECT_DIR is set\}"/);
    expect(content).toMatch(/: "\$\{DASHBOARD_DIR:\?Run step 4 first so DASHBOARD_DIR is set\}"/);
    expect(content).toMatch(/cd "\$PLUGIN_ROOT" && node scripts\/verify-lockfile\.mjs "\$PLUGIN_ROOT" && pnpm install --frozen-lockfile && pnpm --filter @understand-anything\/core build/);
    expect(content).toMatch(/cd "\$DASHBOARD_DIR" && GRAPH_DIR="\$PROJECT_DIR" pnpm exec vite --host 127\.0\.0\.1/);
    // Supply chain: no remote prebuilt viewer, no npx, no install without the lockfile.
    expect(content).not.toMatch(/npx\s/);
    expect(content).not.toMatch(/VIEWER_URL/);
  });

  it('never installs dependencies outside the frozen, verified lockfile', () => {
    for (const rel of [
      'understand-anything-plugin/skills/understand/SKILL.md',
      'understand-anything-plugin/skills/understand-figma/SKILL.md',
      'understand-anything-plugin/skills/understand-dashboard/SKILL.md',
    ]) {
      const content = readRepoFile(rel);
      expect(content, rel).not.toMatch(/\|\|\s*pnpm install/);
      expect(content, rel).not.toMatch(/pnpm install(?! --frozen-lockfile)/);
      expect(content, rel).toMatch(/verify-lockfile\.mjs/);
    }
  });

  it('ships no auto-update hooks', () => {
    expect(existsSync(resolve(repoRoot, 'understand-anything-plugin/hooks'))).toBe(false);
    const skill = readRepoFile('understand-anything-plugin/skills/understand/SKILL.md');
    expect(skill).not.toMatch(/write `\{"autoUpdate": true\}`/);
    expect(skill).toContain('Never write `autoUpdate: true`');
  });

  it('keeps analysis artifacts out of the analyzed project\'s git history', () => {
    const skill = readRepoFile('understand-anything-plugin/skills/understand/SKILL.md');
    expect(skill).toContain('for entry in ".understand-anything/" ".ua/"; do');
  });

  it('restricts every agent to an explicit tool allowlist without web access', () => {
    const dir = resolve(repoRoot, 'understand-anything-plugin/agents');
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      const content = readFileSync(resolve(dir, f), 'utf-8');
      const tools = content.match(/^tools: (.+)$/m)?.[1];
      expect(tools, f).toBeTruthy();
      expect(tools, f).not.toMatch(/Web|mcp__|Agent|Task/);
      expect(content, f).toContain('Untrusted-input rule');
    }
  });

  it('marks project-controlled context as untrusted data', () => {
    const understand = readRepoFile('understand-anything-plugin/skills/understand/SKILL.md');
    const knowledge = readRepoFile('understand-anything-plugin/skills/understand-knowledge/SKILL.md');

    expect(understand).not.toMatch(/README and manifest are authoritative/i);
    expect(understand).toMatch(/untrusted project data/i);
    expect(knowledge).toMatch(/untrusted article data/i);
  });
});

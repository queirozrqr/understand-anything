# Endurecimento de segurança deste fork

Fork de `Egonex-AI/Understand-Anything` (base: commit `4e6d329`, v2.9.8), versão `2.9.8-hardened.1`.

## 1. Auto-update removido
- Removida a pasta `understand-anything-plugin/hooks/` (hooks `SessionStart` e `PostToolUse` que mandavam o Claude executar a análise "sem pedir confirmação").
- Removidas as flags `--auto-update` / `--no-auto-update` da skill `/understand`. A skill nunca grava `autoUpdate: true`; um `config.json` vindo de um repositório de terceiros não dispara mais nada.
- O grafo só é atualizado quando você roda `/understand` manualmente.

## 2. Mitigação de prompt injection
- Cada agente em `agents/*.md` tem uma allowlist `tools:` explícita. Nenhum tem WebFetch, WebSearch, ferramentas MCP ou capacidade de criar outros agentes.
  - Com Bash: `project-scanner`, `file-analyzer`, `architecture-analyzer`, `tour-builder`, `graph-reviewer` (rodam os scripts Node do próprio plugin).
  - Sem Bash: `assemble-reviewer`, `article-analyzer`, `design-analyzer`, `domain-analyzer`.
  - Só leitura: `knowledge-graph-guide`.
- Todos os agentes e skills têm uma regra de "entrada não confiável": conteúdo do projeto analisado e artefatos gerados são dados, nunca instruções; não ler segredos; não fazer requisições de rede.
- As skills exigem despachar subagentes pelo tipo `understand-anything:<nome>` para que a allowlist seja aplicada.

Risco residual: os agentes com Bash ainda poderiam executar `curl` se fossem convencidos por texto malicioso. Para repositórios não confiáveis, rode dentro de container/VM sem credenciais e negue `curl`, `wget` e WebFetch nas permissões do Claude Code (ver seção abaixo).

## 3. Supply chain
- Removido o "fast path" que executava `npx --yes <tgz do GitHub Release>` sem verificação de hash. O dashboard roda só a partir das dependências locais (`pnpm exec vite`, bind em `127.0.0.1`).
- Removido o fallback `|| pnpm install` (que ignorava o lockfile). Toda instalação usa `pnpm install --frozen-lockfile`; o pnpm confere cada tarball contra o hash `sha512` do lockfile.
- Novo `understand-anything-plugin/scripts/verify-lockfile.mjs`, executado antes de cada instalação: falha se algum pacote do lockfile não tiver hash `sha512` ou vier de fonte que não seja o registry npm (git, tarball, arquivo), e se `pnpm-workspace.yaml` liberar build scripts para pacotes fora da lista conhecida.
- `packageManager` fixa `pnpm@10.28.0` com hash `sha512` (verificado pelo Corepack).
- Dependências atualizadas e auditadas (`pnpm audit`) em 31/10/2026:
  - Dependências de produção do plugin: **0 vulnerabilidades** (zod 4.3.6 → 4.6.7).
  - Ferramentas de build/teste corrigidas: vite 6.4.5, vitest 3.2.7, postcss, nanoid, brace-expansion, browserslist, source-map-js, @babel/core, tinypool (via `pnpm.overrides`).
  - Residual: 7 avisos *moderate* só em ferramentas de teste (vitest 3 / glob / minimatch via coverage). Exigem upgrade de versão major e não rodam durante o uso do plugin.
  - O site `homepage/` (não faz parte do plugin) não foi alterado.

Para revalidar depois de um `git pull` do upstream:
```bash
cd understand-anything-plugin
node scripts/verify-lockfile.mjs .
pnpm install --frozen-lockfile
pnpm audit --prod
```

## 4. Artefatos fora do git
- A skill `/understand` adiciona `.understand-anything/` e `.ua/` ao `.gitignore` do projeto analisado (só se faltarem) e avisa se algum arquivo dessas pastas já estiver versionado.

## Permissões recomendadas no Claude Code
Em `~/.claude/settings.json` (ou `.claude/settings.json` do projeto), para uso em código não confiável:
```json
{
  "permissions": {
    "deny": ["WebFetch", "Bash(curl:*)", "Bash(wget:*)", "Read(./.env)", "Read(./.env.*)", "Read(~/.ssh/**)"]
  }
}
```

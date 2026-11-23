#!/usr/bin/env bash
#
# Promove o que está em `development` para staging ou produção, pela ordem que
# não parte nada (CLAUDE.md, «As duas metades»):
#
#   1. confirma que os dois repositórios estão limpos, iguais ao GitHub, e que
#      o branch de destino avança sem conflitos;
#   2. tipos e testes do Convex;
#   3. publica o Convex do ambiente (deploy key em ~/.config/luxmotion/);
#   4. corre a migração dos agregados (orderFacts:backfill) e espera que acabe;
#   5. avança o branch do site (o Railway publica);
#   6. no dashboard, põe o contrato do ambiente neste commit, confirma que
#      compila e avança o branch;
#   7. espera pelas duas publicações no Railway, pelo estado no GitHub.
#
# Uso:
#   scripts/promover.sh staging
#   scripts/promover.sh production --sim-producao
#
# A chave de cada ambiente cria-se uma vez, sem a mostrar:
#   npx convex@latest deployment token create promocao-staging \
#     --deployment acoustic-gazelle-962 --save-env ~/.config/luxmotion/convex-staging.env
#
# Nunca força nada: se um branch não avançar sem conflitos, pára.

set -euo pipefail

AMB="${1:-}"
case "$AMB" in
  staging) DEPLOYMENT="acoustic-gazelle-962" ;;
  production) DEPLOYMENT="clean-starling-300" ;;
  *)
    echo "uso: scripts/promover.sh staging | production --sim-producao" >&2
    exit 1
    ;;
esac
if [ "$AMB" = "production" ] && [ "${2:-}" != "--sim-producao" ]; then
  echo "Produção é o que os clientes vêem: repita com --sim-producao." >&2
  exit 1
fi

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
DASH="${DASHBOARD_DIR:-$(cd "$RAIZ/../.." && pwd)/dashboard}"
CHAVE="${CONVEX_KEY_FILE:-$HOME/.config/luxmotion/convex-$AMB.env}"
ORG="EasyTransfer-Luxmotion"

passo() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
falha() { printf '\n\033[31m✖ %s\033[0m\n' "$*" >&2; exit 1; }

# ── 1. Os dois repositórios ──────────────────────────────────────────────
verificar_repo() {
  local dir="$1" nome="$2"
  [ -d "$dir/.git" ] || falha "$nome: não encontrei o repositório em $dir (DASHBOARD_DIR?)"
  git -C "$dir" fetch -q origin
  [ "$(git -C "$dir" rev-parse --abbrev-ref HEAD)" = "development" ] || falha "$nome: não está no branch development"
  [ -z "$(git -C "$dir" status --porcelain --untracked-files=no)" ] || falha "$nome: há alterações por gravar"
  [ "$(git -C "$dir" rev-parse HEAD)" = "$(git -C "$dir" rev-parse origin/development)" ] || falha "$nome: development local diferente do GitHub (pull ou push primeiro)"
  if git -C "$dir" rev-parse -q --verify "origin/$AMB" >/dev/null; then
    git -C "$dir" merge-base --is-ancestor "origin/$AMB" origin/development || falha "$nome: $AMB tem commits que development não tem; resolver à mão"
  fi
}
passo "Repositórios"
verificar_repo "$RAIZ" "luxmotion"
verificar_repo "$DASH" "dashboard"
SHA="$(git -C "$RAIZ" rev-parse HEAD)"
echo "luxmotion $(git -C "$RAIZ" rev-parse --short HEAD): $(git -C "$RAIZ" rev-list --count "origin/$AMB..origin/development" 2>/dev/null || echo '?') commits para $AMB"

# ── 2. Tipos e testes ────────────────────────────────────────────────────
passo "Tipos e testes do Convex"
(cd "$RAIZ/packages/convex" && pnpm -s typecheck && npx vitest run --reporter=dot)

# ── 3. Convex ────────────────────────────────────────────────────────────
passo "Convex de $AMB ($DEPLOYMENT)"
[ -f "$CHAVE" ] || falha "falta a deploy key em $CHAVE (ver o topo deste ficheiro)"
CONVEX_DEPLOY_KEY="$(sed -n 's/^CONVEX_DEPLOY_KEY=//p' "$CHAVE" | tr -d '"')"
[ -n "$CONVEX_DEPLOY_KEY" ] || falha "$CHAVE não tem CONVEX_DEPLOY_KEY"
# A chave diz para onde publica: confirmar antes de publicar.
case "$CONVEX_DEPLOY_KEY" in
  *"$DEPLOYMENT"*) ;;
  *) falha "a chave em $CHAVE não é do deployment $DEPLOYMENT" ;;
esac
export CONVEX_DEPLOY_KEY
convex() { (cd "$RAIZ/packages/convex" && env -u CONVEX_DEPLOYMENT npx convex "$@"); }
# Uma simulação primeiro: o CLAUDE.md avisa que a CLI já publicou no sítio
# errado com o CONVEX_DEPLOYMENT do .env.local. Só avança se for o destino.
#   (A saída guarda-se primeiro: com pipefail, um grep -q à frente fazia o
#   npx morrer de SIGPIPE e a guarda parar mesmo com o destino certo.)
simulacao="$(convex deploy -y --dry-run --codegen disable 2>&1 || true)"
grep -q "Deploying to https://$DEPLOYMENT\." <<<"$simulacao" || falha "a simulação não aponta para $DEPLOYMENT: não publiquei"
convex deploy -y --codegen disable

# ── 4. Migração dos agregados ────────────────────────────────────────────
passo "Migração dos agregados (orderFacts:backfill)"
convex run orderFacts:backfill '{}' >/dev/null
# Corre em lotes agendados; acaba no último lote das organizações.
for _ in $(seq 1 360); do
  estado="$(convex data _scheduled_functions --limit 3 --order desc --format jsonArray 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const fs = JSON.parse(s.slice(s.indexOf("["))).filter((f) => String(f.name).startsWith("orderFacts"));
      if (!fs.length) return console.log("nada");
      const k = fs.map((f) => f.state && f.state.kind);
      if (k.some((x) => x === "pending" || x === "inProgress")) return console.log("a correr " + fs[0].args[0].table + " " + (fs[0].args[0].done || 0));
      if (k.includes("failed")) return console.log("falhou");
      console.log(fs[0].args[0].table === "organizacoes" ? "acabou" : "parado " + fs[0].args[0].table);
    });')"
  case "$estado" in
    acabou) break ;;
    falhou*) falha "a migração falhou (ver os logs do Convex de $AMB)" ;;
    *) printf '\r  %s        ' "$estado"; sleep 5 ;;
  esac
done
[ "$estado" = "acabou" ] || falha "a migração não acabou em 30 minutos ($estado)"
echo; convex run orderFacts:counts

# ── 5. Site ──────────────────────────────────────────────────────────────
passo "Site: $AMB ← development"
git -C "$RAIZ" push origin "origin/development:refs/heads/$AMB"

# ── 6. Dashboard ─────────────────────────────────────────────────────────
passo "Dashboard: contrato de $AMB e $AMB ← development"
node -e '
  const fs = require("fs");
  const [file, amb, sha] = process.argv.slice(1);
  const d = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!d.environments[amb]) throw new Error("sem o ambiente " + amb + " no contrato");
  d.environments[amb].commit = sha;
  fs.writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
' "$DASH/convex-contracts.json" "$AMB" "$SHA"
if [ -n "$(git -C "$DASH" status --porcelain convex-contracts.json)" ]; then
  (cd "$DASH" && node scripts/sync-convex.mjs >/dev/null && pnpm exec tsc --noEmit) || {
    git -C "$DASH" checkout convex-contracts.json
    falha "o dashboard não compila com o Convex de $SHA"
  }
  git -C "$DASH" commit -q -m "chore(convex): contrato de $AMB no luxmotion ${SHA:0:7}" -- convex-contracts.json
  git -C "$DASH" push -q origin development
fi
DSHA="$(git -C "$DASH" rev-parse HEAD)"
git -C "$DASH" push origin "development:refs/heads/$AMB"

# ── 7. Publicações no Railway ────────────────────────────────────────────
passo "Publicações no Railway"
esperar() {
  local repo="$1" sha="$2"
  for _ in $(seq 1 120); do
    local st
    st="$(gh api "repos/$ORG/$repo/deployments?sha=$sha" --jq ".[] | select(.environment | endswith(\"/ $AMB\")) | .statuses_url" 2>/dev/null | head -1 | xargs -I{} gh api {} --jq '.[0].state' 2>/dev/null || true)"
    case "$st" in
      success) echo "  $repo ${sha:0:7}: publicado"; return 0 ;;
      failure|error) echo "  $repo ${sha:0:7}: FALHOU (o Railway às vezes morre sem erro: republicar)"; return 1 ;;
    esac
    sleep 15
  done
  echo "  $repo ${sha:0:7}: sem estado ao fim de 30 minutos"
  return 1
}
ok=0
esperar luxmotion "$SHA" || ok=1
esperar dashboard "$DSHA" || ok=1
[ "$ok" = 0 ] || falha "uma das publicações não acabou bem"
passo "$AMB está em luxmotion ${SHA:0:7} e dashboard ${DSHA:0:7}"

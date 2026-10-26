#!/usr/bin/env bash
# Monta e mantém o time Sinuca no Maestri a partir de papeis/*.md.
#   time.sh setup     ["<Principal>"]   cria os roles e as notas que faltam
#   time.sh atualizar ["<Principal>"]   reescreve os roles (reinicia recrutas: use entre lotes)
#   time.sh recrutar  <papel>...        recruta os papéis e liga as notas
#   time.sh religar   <papel>...        reinicia o terminal no lugar com o comando padrão (retoma a sessão)
#   time.sh despachar <papel> <arquivo> [--sem-clear]   espera o terminal ficar livre, manda /clear e o lote
#                                       (rode em segundo plano e encerre o turno: o ask-back só volta depois)
#   time.sh esforco   <papel> <low|medium|high|xhigh|max>   reinicia o terminal com outro esforço (lote difícil: xhigh;
#                                       o padrão de todos é high). Rode com o terminal livre. Nunca use /effort no terminal:
#                                       ele grava o nível como padrão global do usuário em ~/.claude/settings.json
#   time.sh prompt    <papel> ["<Principal>"]   mostra o prompt do role, sem tocar no Maestri
# Papéis: brainstormer dev frontend backend qa artista revisor. Sem "<Principal>", usa o terminal atual.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(cd "$DIR/../../.." && pwd)"
M="${MAESTRI_CLI:-maestri}"
FICHARIO="Sinuca"
NOTAS=(sinuca-status sinuca-perguntas sinuca-bugs)
# Os plugins da Vercel e da Stripe não servem à sinuca: fora só nesta sessão (não mexe no settings.json do usuário).
CLAUDE="claude --dangerously-skip-permissions --settings '{\"enabledPlugins\":{\"vercel@claude-plugins-official\":false,\"stripe@claude-plugins-official\":false}}'"

# papel|role|terminal|flags do claude
TIME=(
  "brainstormer|Sinuca Brainstormer|Boteco|--model sonnet --effort high"
  "dev|Sinuca Dev|Taco|--model sonnet --effort high"
  "frontend|Sinuca Frontend|Feltro|--model sonnet --effort high"
  "backend|Sinuca Backend|Sala|--model sonnet --effort high"
  "qa|Sinuca QA|Giz|--model sonnet --effort high"
  "artista|Sinuca Artista|Pincel|--model sonnet --effort xhigh --mcp-config '{\"mcpServers\":{\"blender\":{\"command\":\"uvx\",\"args\":[\"blender-mcp\"],\"env\":{\"DISABLE_TELEMETRY\":\"true\"}}}}'"
  "revisor|Sinuca Revisor|Juiz|--model opus --effort high --disallowedTools Edit Write NotebookEdit"
)

# --continue retoma a sessão do role depois de um reinício do Maestri; sem sessão ainda, ele falha e abre uma nova.
comando_claude() { printf '%s --continue %s || %s %s' "$CLAUDE" "$1" "$CLAUDE" "$1"; }

linha_do_papel() {
  local l
  for l in "${TIME[@]}"; do
    [[ "${l%%|*}" == "$1" ]] && { printf '%s' "$l"; return 0; }
  done
  echo "papel desconhecido: $1 (use: brainstormer dev frontend backend qa artista revisor)" >&2
  return 1
}

detectar_principal() {
  local nome
  nome="$("$M" list 2>/dev/null | sed -n '/^You:/{n;s/.*name: "\([^"]*\)".*/\1/p;}')"
  [[ -n "$nome" ]] || { echo "não achei o terminal atual em 'maestri list'; passe o nome do Principal" >&2; return 1; }
  printf '%s' "$nome"
}

prompt_do_papel() {
  local arq="$DIR/papeis/$1.md" principal="$2" p
  p="$(sed -n '/<!-- prompt:inicio -->/,/<!-- prompt:fim -->/{//!p;}' "$arq")"
  [[ -n "$p" ]] || { echo "sem bloco de prompt em $arq" >&2; return 1; }
  p="${p//"{{PRINCIPAL}}"/"$principal"}"
  p="${p//"{{RAIZ}}"/"$RAIZ"}"
  printf '%s' "$p"
}

conteudo_nota() {
  case "$1" in
    sinuca-status) cat <<'EOF'
# sinuca-status
Sessões (terminal → id): preencher no setup
Uma seção "## L<n> <papel>" por lote; o Principal acrescenta "Revisão: passou | precisa de ajuste".

## Fase 0
EOF
    ;;
    sinuca-perguntas) cat <<'EOF'
# sinuca-perguntas
Formato: - [ ] pergunta — o que desbloqueia — quem perguntou
Respondida: [RESPONDIDA data] resposta

## Abertas

## Novas

## Respondidas
EOF
    ;;
    sinuca-bugs) cat <<'EOF'
# sinuca-bugs
Formato: B<n> [aberto | corrigido L<n> | confirmado] <dono> <severidade> — <título>
  passos: ... | esperado: ... | obtido: ... | evidência: .outros/lote-<n>/...

## Abertos

## Fechados
EOF
    ;;
  esac
}

criar_notas() {
  local lista n
  lista="$("$M" list 2>/dev/null || true)"
  for n in "${NOTAS[@]}"; do
    if grep -Fq "$n" <<<"$lista"; then echo "nota existe: $n"; continue; fi
    "$M" note create "$(conteudo_nota "$n")" --name "$n" --stack "$FICHARIO" >/dev/null
    echo "nota criada: $n"
  done
}

cmd_setup() {
  local principal l papel role
  principal="${1:-$(detectar_principal)}"
  echo "Principal: $principal | raiz: $RAIZ"
  for l in "${TIME[@]}"; do
    IFS='|' read -r papel role _ _ <<<"$l"
    if "$M" role show "$role" >/dev/null 2>&1; then
      echo "role existe: $role"
    else
      "$M" role create "$role" "$(prompt_do_papel "$papel" "$principal")" >/dev/null
      echo "role criado: $role"
    fi
  done
  criar_notas
}

cmd_atualizar() {
  local principal l papel role
  principal="${1:-$(detectar_principal)}"
  for l in "${TIME[@]}"; do
    IFS='|' read -r papel role _ _ <<<"$l"
    if "$M" role show "$role" >/dev/null 2>&1; then
      "$M" role write "$role" "$(prompt_do_papel "$papel" "$principal")" >/dev/null
      echo "role reescrito: $role"
    else
      echo "role não existe (rode setup): $role"
    fi
  done
}

cmd_recrutar() {
  [[ $# -gt 0 ]] || { echo "uso: time.sh recrutar <papel>..." >&2; exit 1; }
  local lista papel l role terminal flags comando n
  lista="$("$M" list 2>/dev/null || true)"
  for papel in "$@"; do
    l="$(linha_do_papel "$papel")"
    IFS='|' read -r _ role terminal flags <<<"$l"
    comando="$(comando_claude "$flags")"
    if grep -Fq "\"$terminal\"" <<<"$lista"; then
      echo "já no canvas: $terminal"
    else
      "$M" role show "$role" >/dev/null 2>&1 || { echo "role '$role' não existe: rode setup antes" >&2; exit 1; }
      "$M" recruit "$terminal" --role "$role" --command "$comando"
      echo "recrutado: $terminal ($role)"
    fi
    for n in "${NOTAS[@]}"; do
      if "$M" connect "$n" "$terminal" >/dev/null 2>&1; then echo "  ligado: $n ↔ $terminal"
      else echo "  não liguei $n ↔ $terminal (já ligado ou nota ausente)"; fi
    done
  done
}

cmd_religar() {
  [[ $# -gt 0 ]] || { echo "uso: time.sh religar <papel>..." >&2; exit 1; }
  local papel l terminal flags
  for papel in "$@"; do
    l="$(linha_do_papel "$papel")"
    IFS='|' read -r _ _ terminal flags <<<"$l"
    "$M" recruit "$terminal" --replace "$terminal" --command "$(comando_claude "$flags")"
    echo "religado: $terminal"
  done
}

cmd_despachar() {
  local papel="${1:?uso: time.sh despachar <papel> <arquivo> [--sem-clear]}" arq="${2:?uso: time.sh despachar <papel> <arquivo> [--sem-clear]}" l terminal
  [[ -f "$arq" ]] || { echo "arquivo não existe: $arq" >&2; exit 1; }
  l="$(linha_do_papel "$papel")"
  IFS='|' read -r _ _ terminal _ <<<"$l"
  ocupado() { "$M" check "$terminal" 2>&1 | tail -3 | grep -q "esc to interrupt"; }
  until ! ocupado; do sleep 5; done
  if [[ "${3:-}" != "--sem-clear" ]]; then
    "$M" ask "$terminal" --raw "/clear\n" >/dev/null 2>&1
    sleep 4
    until ! ocupado; do sleep 5; done
  fi
  "$M" ask "$terminal" "$(cat "$arq")"
}

cmd_esforco() {
  local papel="${1:?uso: time.sh esforco <papel> <nivel>}" nivel="${2:?uso: time.sh esforco <papel> <nivel>}" l terminal flags
  [[ "$nivel" =~ ^(low|medium|high|xhigh|max)$ ]] || { echo "nível inválido: $nivel" >&2; exit 1; }
  l="$(linha_do_papel "$papel")"
  IFS='|' read -r _ _ terminal flags <<<"$l"
  flags="$(sed -E "s/--effort [a-z]+/--effort $nivel/" <<<"$flags")"
  "$M" recruit "$terminal" --replace "$terminal" --command "$(comando_claude "$flags")"
  echo "religado: $terminal com --effort $nivel (time.sh religar $papel volta ao padrão)"
}

case "${1:-}" in
  esforco) shift; cmd_esforco "$@" ;;
  setup) shift; cmd_setup "$@" ;;
  religar) shift; cmd_religar "$@" ;;
  despachar) shift; cmd_despachar "$@" ;;
  atualizar) shift; cmd_atualizar "$@" ;;
  recrutar) shift; cmd_recrutar "$@" ;;
  prompt) shift; papel="${1:?uso: time.sh prompt <papel> [\"<Principal>\"]}"; linha_do_papel "$papel" >/dev/null; prompt_do_papel "$papel" "${2:-$(detectar_principal)}"; echo ;;
  *) sed -n '2,11p' "$0"; exit 1 ;;
esac

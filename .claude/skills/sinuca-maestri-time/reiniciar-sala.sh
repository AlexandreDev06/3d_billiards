#!/usr/bin/env bash
# Reinicia o servidor da sala na 8001 (build novo do web + sala) SEM derrubar partida em andamento.
# Recusa se houve atividade no log nos últimos N minutos (padrão 15). Uso: reiniciar-sala.sh [--forcar] [--minutos N]
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../../.."
LOG=.outros/online/sala.log; MIN=15; FORCAR=0
while [[ $# -gt 0 ]]; do case "$1" in --forcar) FORCAR=1;; --minutos) MIN="$2"; shift;; esac; shift; done
if [[ -f "$LOG" && $FORCAR -eq 0 ]]; then
  ultima=$(grep -E ' (tacada|entrou|iniciou|voltou|sala-criada) ' "$LOG" | tail -1 | cut -c1-24 || true)
  if [[ -n "$ultima" ]]; then
    idade=$(( $(date -u +%s) - $(date -u -d "$ultima" +%s) ))
    if (( idade < MIN * 60 )); then
      echo "RECUSADO: atividade há $((idade / 60)) min ($ultima). Tem gente jogando? Espere ou use --forcar." >&2
      grep -E ' (tacada|entrou|iniciou) ' "$LOG" | tail -3 >&2; exit 2
    fi
  fi
fi
# Servidor subido à mão pelo usuário não escreve no LOG: conexões abertas na 8001 (WebSocket via ngrok) também contam.
if [[ $FORCAR -eq 0 ]]; then
  abertas=$(ss -tn state established '( sport = :8001 )' 2>/dev/null | tail -n +2 | wc -l)
  if (( abertas > 0 )); then
    echo "RECUSADO: $abertas conexão(ões) abertas na 8001. Tem gente na sala? Espere ou use --forcar." >&2; exit 2
  fi
fi
# Sem servidor no ar o grep não acha nada: `|| true` e `if`, senão o set -e encerra o script calado.
p=$(ss -ltnp 2>/dev/null | grep "127.0.0.1:8001 " | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -1 || true)
if [[ -n "$p" ]]; then kill "$p"; fi
for _ in $(seq 1 10); do ss -ltn | grep -q "127.0.0.1:8001 " || break; sleep 1; done
mkdir -p .outros/online; if [[ -f "$LOG" ]]; then mv "$LOG" ".outros/online/sala-ate-$(date +%m%d-%H%M).log"; fi
(setsid nohup pnpm online > "$LOG" 2>&1 < /dev/null &)
for _ in $(seq 1 150); do ss -ltn | grep -q "127.0.0.1:8001 " && break; sleep 1; done
ss -ltn | grep -q "127.0.0.1:8001 " && echo "sala no ar (PID $(ss -ltnp | grep '127.0.0.1:8001 ' | sed -n 's/.*pid=\([0-9]*\).*/\1/p'))" || { echo "FALHOU ao subir: veja $LOG" >&2; exit 1; }
pgrep -f '^ngrok http' >/dev/null || echo "aviso: ngrok parado (ngrok http --inspect=false --domain=mayfly-one-mainly.ngrok-free.app 8001)"

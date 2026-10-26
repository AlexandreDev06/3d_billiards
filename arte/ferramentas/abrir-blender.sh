#!/usr/bin/env bash
# Abre o Blender com janela na tela do usuário (DISPLAY=:1) e o servidor MCP ligado.
# Uso: bash arte/ferramentas/abrir-blender.sh [arquivo.blend]
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export DISPLAY="${DISPLAY:-:1}"
setsid nohup "$HOME/.local/bin/blender" ${1:+"$1"} --python "$AQUI/iniciar_mcp.py" >"${TMPDIR:-/tmp}/blender-gui.log" 2>&1 &
for _ in $(seq 1 30); do
  sleep 1
  if ss -ltn 2>/dev/null | grep -q ':9876 '; then echo "Blender no ar, MCP em localhost:9876"; exit 0; fi
done
echo "O servidor MCP não subiu; veja ${TMPDIR:-/tmp}/blender-gui.log" >&2
exit 1

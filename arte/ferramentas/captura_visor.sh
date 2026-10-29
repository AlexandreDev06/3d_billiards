#!/bin/bash
# Captura um quadro de um visor three.js (arte/visor/) com o Chrome sem janela.
# Pré-requisito: python3 -m http.server 8731 --bind 127.0.0.1 na raiz do repositório (nunca a 8001).
# uso: captura_visor.sh balao|boteco|index saida.png "query" [largura altura]      (VIRTUAL_TIME=ms para visores pesados; padrão 20000)
# Usa um perfil temporário do Chrome (com o perfil padrão, outra janela aberta do Chrome faz a captura sair em branco) e repete até 3 vezes se o quadro sair vazio.
PAGINA=$1; W=${4:-640}; H=${5:-480}; T=${VIRTUAL_TIME:-20000}
PERFIL=$(mktemp -d)
trap 'rm -rf "$PERFIL"' EXIT
for tentativa in 1 2 3; do
  rm -f "$2"
  timeout 120 google-chrome --headless=new --no-sandbox --user-data-dir="$PERFIL" --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --hide-scrollbars --window-size=$W,$H --virtual-time-budget=$T --screenshot="$2" "http://127.0.0.1:8731/arte/visor/$PAGINA.html?captura&tam=${W}x${H}&$3" >/dev/null 2>&1
  [ -f "$2" ] && [ "$(stat -c %s "$2")" -gt 5000 ] && exit 0
  T=$((T * 2))
done
echo "captura vazia: $2" >&2
exit 1

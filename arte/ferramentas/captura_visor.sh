#!/bin/bash
# Captura um quadro de um visor three.js (arte/visor/) com o Chrome sem janela.
# Pré-requisito: python3 -m http.server 8731 --bind 127.0.0.1 na raiz do repositório.
# uso: captura_visor.sh balao|index saida.png "query" [largura altura]
PAGINA=$1; W=${4:-640}; H=${5:-480}
timeout 60 google-chrome --headless=new --no-sandbox --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist --hide-scrollbars --window-size=$W,$H --virtual-time-budget=6000 --screenshot="$2" "http://127.0.0.1:8731/arte/visor/$PAGINA.html?captura&tam=${W}x${H}&$3" >/dev/null 2>&1

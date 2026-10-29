#!/bin/bash
# Refaz o boteco inteiro (P5): fotos CC0 (só se faltarem), texturas desenhadas, letreiro (arte/marca) e, para cada nível, o Blender monta a cena, assa a luz no Cycles (GPU OptiX se houver;
# senão CPU, bem mais lento), o atlas JPEG é composto e o .glb sai com o .blend; no fim o contrato (boteco-meta.json) e a validação.
# uso, de qualquer pasta: bash arte/boteco/scripts/00_tudo.sh [baixo medio alto]      (precisa de Blender 5 no PATH, `uv`, ~3 GB de RAM livres e, para a validação, `node` com `npm i gltf-validator`)
# Tempo medido (RTX 4070 SUPER): baixo ~1 min, médio ~1 min, alto ~3 min.
set -e
cd "$(dirname "$0")/../../.."
AQUI=arte/boteco/scripts
NIVEIS=${@:-baixo medio alto}
uv run --with pillow --with numpy python3 "$AQUI/fotos.py"
uv run --with numpy --with pillow python3 "$AQUI/texturas.py" arte/boteco/texturas
uv run --with numpy --with pillow python3 "$AQUI/marca.py" arte/marca
for n in $NIVEIS; do
  rm -rf "arte/boteco/trabalho/$n"
  blender -b --factory-startup --python "$AQUI/construir.py" -- --fase montar --nivel "$n" 2>&1 | grep -E "TRIANGULOS|Error:|Traceback" | grep -v "Not freed" || true
  uv run --with numpy --with pillow --with scipy python3 "$AQUI/compor.py" "arte/boteco/trabalho/$n" "$n"
  rm -f "arte/boteco/trabalho/$n"/*/*.npy      # as passes brutas (até 270 MB) não servem depois do atlas
  blender -b --factory-startup --python "$AQUI/construir.py" -- --fase exportar --nivel "$n" --publicar 2>&1 | grep -E "exportado|Error:|Traceback" | grep -v "Not freed" || true
done
uv run --with numpy python3 "$AQUI/meta.py"

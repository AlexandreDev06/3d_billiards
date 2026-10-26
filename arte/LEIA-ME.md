# arte/

Personagens do jogo feitos no Blender e exportados em glTF (`.glb`). Dono: o Artista (terminal "Pincel").

```text
arte/
  referencias/maos-cartoon-usuario.png   a referência de estilo que o usuário mandou (luva de desenho clássico)
  ferramentas/                           abrir o Blender com janela e o servidor MCP
  personagens/
    mao.blend, balao.blend               as cenas do Blender (fonte)
    scripts/                             tudo que gera a mão (.blend e .glb), na ordem dos números
    scripts/balao/                       idem para o balão (dados, geometria, esqueleto, ações, renders, exportação)
    scripts/p1/                          os scripts e os dados do P1 (metabolas + Quadriflow), só para a história
    exportados/mao.glb, mao-taco.json, mao-meta.json  o que o jogo carrega da mão (as ações, o taco e o apoio de cada ponte, os contatos dos gestos)
    exportados/balao.glb, balao-meta.json  o que o jogo carrega do balão (e o contrato: nomes, eixos, pontos das mãos)
  ferramentas/folha_p1.py                a folha de comparação do P1 (Pillow)
  ferramentas/folha_p1b.py               a folha L27 × P1 × P1b (ponte, punho e pinça, de cima e na câmera do jogo)
  ferramentas/folha_balao.py             a folha do balão (caras, ações, câmera do jogo, visor)
  ferramentas/folha_l29.py               a folha do L29 (5 pontes na câmera do jogo + tira dos gestos no quadro de pico, do visor)
  ferramentas/tira.py                    tira de quadros legendados (Pillow)
  ferramentas/captura_visor.sh           quadro do visor com o Chrome sem janela
  visor/                                 visores three.js que provam os .glb (porta livre, nunca a 8001): index.html (mão), balao.html (balão)
```

## Etapa 0: ferramentas (para outro chat refazer)

Máquina: Linux, RTX 4070 SUPER, sem sudo. Tudo em `~/.local`.

1. **Blender 5.2.3 LTS** (a estável mais recente em 2026-10-22). Tarball oficial, conferido pelo sha256 do site:

   ```bash
   cd /tmp && curl -LO https://download.blender.org/release/Blender5.2/blender-5.2.3-linux-x64.tar.xz
   curl -s https://download.blender.org/release/Blender5.2/blender-5.2.3.sha256 | grep linux-x64   # compare com sha256sum
   mkdir -p ~/.local/opt/blender-5.2.3 && tar -xJf blender-5.2.3-linux-x64.tar.xz -C ~/.local/opt/blender-5.2.3 --strip-components=1
   ln -sfn ~/.local/opt/blender-5.2.3 ~/.local/opt/blender && ln -sf ~/.local/opt/blender/blender ~/.local/bin/blender
   ```

   O Python do Blender já traz `numpy` e `requests`; não precisa instalar nada nele.

2. **MCP do Blender.** O servidor desta sessão é o `mcp-for-blender` (`uvx mcp-for-blender`, mantido pelo mesmo autor do
   `ahujasid/blender-mcp`; o `addon.py` vem dentro do pacote). Instale só o complemento, sem o `setup` (que mexe nas
   configurações dos clientes MCP):

   ```bash
   mkdir -p ~/.config/blender/5.2/scripts/addons
   uvx mcp-for-blender install-addon --addons-dir ~/.config/blender/5.2/scripts/addons
   ```

3. **Abrir o Blender com janela e o MCP ligado** (o usuário acompanha na tela dele):

   ```bash
   bash arte/ferramentas/abrir-blender.sh [arte/personagens/mao.blend]
   ```

   O script usa `DISPLAY=:1`, habilita o complemento `blender_mcp` e sobe o servidor em `localhost:9876`; o MCP `blender`
   da sessão fala com ele (`get_addon_status` confirma). **Telemetria e coleta de dados ficam desligadas**
   (`telemetry_consent: false`): nunca ligue, nunca chame `record_trajectory_feedback` e deixe `user_prompt` vazio.

4. **Render e exportação sem janela** (`blender -b arte/personagens/mao.blend --python <script>`) ficam para as provas
   finais. O EEVEE do Blender precisa do X aberto (`DISPLAY=:1`) mesmo em `--background`.

## Como o personagem é feito (a mão)

Estilo: luva de desenho (dedos roliços e da mesma grossura do começo ao fim, pontas em domo, vão claro entre eles, nós só
como uma dobra suave, palma cheia, polegar gordo, punho enrolado como boca de balão), com acabamento
**realista**: látex liso e brilhante, sem contorno e sem sombreamento toon. Só a forma é cartum. Mão direita, palma para
baixo, dedos em +Y, polegar em -X, 18,2 cm da base do punho à ponta do médio; a esquerda é o espelho (escala X = -1 no jogo).
Os números da mão estão todos em `mao_dados.py`, em centímetros.

Scripts de `arte/personagens/scripts/`, na ordem. `00_tudo.py` refaz 01, 03 e 04 do zero (cerca de 1 s) (na janela do Blender pelo MCP, ou
`blender -b --factory-startup --python .../00_tudo.py -- --salvar arte/personagens/mao.blend`):

| Script | O que faz |
| --- | --- |
| `01_gaiola.py` | a malha direto em quadriláteros (bmesh), sem escultura: palma em loft de caixa elíptica (seções superelípticas, linha dos nós), cada dedo um tubo de raio constante com cintura de 2,5% nas juntas e ponta em domo, polegar extrudado de um bloco 2×2 da parede esquerda, punho enrolado em anéis. A alta (`mao_alta`, ~4,5 mil tris) leva subdivisão Catmull-Clark nível 1 (com `engorda` para compensar o encolhimento); a baixa (`mao_baixa`, ~0,8 mil) é a gaiola rala sem subdivisão |
| `03_esqueleto.py` | 17 ossos (pulso, palma, 3 por dedo) à mão e pesos por distância à cápsula do osso |
| `04_poses.py` | uma ação por pose e uma faixa NLA para cada (o exportador leva todas), a partir de `mao_poses.py` e `mao_gestos.py`; o gesto usa Bézier. Nos gestos com contato (`gesto_tapinha`, `gesto_palmas`) `encostar` mede a malha e ajusta o `loc` do pulso para o ponto extremo cair no plano; grava `gestos_medidos.json`. `-- --salvar arte/personagens/mao.blend` regrava o .blend |
| `05b_resolver_pontes.py` | as cinco pontes do L29 (`pose_ponte_laco`, `_elevada`, `_tabela`, `_colada`, `_canto`): mesmo solver, uma `Cena2` com grupos de vértices e `loc:x/y/z`; cada ponte é um problema (`problema_laco`...) com setores de contato do taco, pontas pousadas no plano de apoio e preferências de ângulo; multi-start (`-- ponte_laco SEMENTE PARTIDAS`). Grava a pose, o taco e o apoio (`apoio_ponto_cm`, `apoio_normal`, `apoio_tipo`, folgas) em `poses_resolvidas.json`. `-- completar_ponte_v` acrescenta o apoio da `pose_ponte_v` |
| `05_resolver_poses.py` | achar ponte V, punho e pinça: mínimos quadrados (`mao_solver.py`) medindo a malha deformada (`mao_provas.py`: distância assinada, `folgas_radiais` com raios do eixo do taco, taco cônico 1,45 m, cubo de 2,2 cm). A pinça mede o contato na pele (centro da face do polegar a 0 mm), com o cubo livre. Grava `poses_resolvidas.json`, que o `mao_poses.py` lê. Só rode de novo se mudar a forma; o solver cai em mínimo local se partir de dedos esticados (o punho precisa partir de uma mão já enrolada, a pinça se resolve em duas etapas: cubo, depois cubo + polegar) |
| `mao_anim.py` / `mao_gestos.py` | os gestos do L29, escritos pelo que se vê: chaves por osso (graus) em quadros a 30/s, e `mao_anim.construir` faz as curvas (cúbica monótona que freia nas chaves travadas), o atraso por osso (sobreposição), a mola de 2ª ordem (follow-through) e a `vida` (micro-oscilação que cresce no fim, para não terminar estátua). `META` leva pico, picos, ciclo e aditivo |
| `06_renders.py` | renders EEVEE sem janela (luz quente por cima, fundo escuro): `DISPLAY=:1 blender -b arte/personagens/mao.blend --python arte/personagens/scripts/06_renders.py -- --saida DIR --poses a,b --angulos cima,tres_quartos,lado,jogo_ponte45,jogo_punho [--lod baixa] [--quadro N \| --quadros 0,6,12] [--silhueta] [--sem-apoio] [--props json\|blend]`. `jogo_ponte` (28°) e `jogo_ponte45` (45°, a que mostra a ponte elevada sem o taco tampar a lente) e `jogo_punho` são a câmera do jogo (atrás e acima do taco, olhando ao longo dele). Taco, cubo e plano de apoio (pano ou madeira) saem de `poses_resolvidas.json` (ou do próprio .blend com `--props blend`, para o backup do P1). `--silhueta` é preto sobre branco (Workbench) |
| `07_exportar.py` | `exportados/mao.glb` (cor base branca, verniz `KHR_materials_clearcoat`, 19 animações nomeadas a 30 quadros/s), `exportados/mao-taco.json` (onde fica o taco ou o cubo de cada pose, o apoio das pontes e os contatos dos gestos, no referencial da mão, em metros) e `exportados/mao-meta.json` (ações, quadros, picos, ciclos, aditivo) |

**Boca do punho (P1c).** A boca da luva é fechada por uma tampa côncava (`malha_do_punho` em `mao_lib.py`: parede interna curta, anéis que
descem 0,9 cm em parábola e um leque no centro), no segundo material `latex_fundo` (o mesmo látex, base cinza 0,42, para parecer o fundo de uma
luva de borracha). No `.glb` o par é `latex_glb` (índice 0) e `latex_fundo_glb` (índice 1); cada malha tem duas primitivas e o GLTFLoader cria
dois filhos (`mao_alta`, `mao_alta_1`): tinja só o `latex_glb` (cor base branca) e deixe o fundo cinza. A alta tem 3880 triângulos.

Ações do `.glb` (19; `mao-meta.json` tem quadros, picos e ciclos):

- Poses (3 quadros iguais, 0 a 2; toque com `LoopOnce` e `clampWhenFinished`, entre uma e outra `crossFadeFrom`): `pose_repouso`, `pose_aberta`, `pose_apontar`, `pose_punho`, `pose_pinca` e as seis pontes `pose_ponte_v`, `pose_ponte_laco`, `pose_ponte_elevada`, `pose_ponte_tabela`, `pose_ponte_colada`, `pose_ponte_canto`.
- Gestos (30 quadros/s, começam e terminam na `pose_repouso`; o fade de entrada é do jogo): `gesto_joinha`, `gesto_soco_ar`, `gesto_tapinha`, `gesto_quase`, `gesto_palmas`, `gesto_tamborilar` (ciclo 0–24), `gesto_mole`, `gesto_respirar` (aditivo).
- Aditivo (`gesto_respirar`): o glTF não tem mistura aditiva. No three.js: `clip = THREE.AnimationUtils.makeClipAdditive(clip.clone(), 0)` (o quadro 0 é a referência), `action.blendMode = THREE.AdditiveAnimationBlendMode`, `LoopRepeat`, e toca por cima de qualquer pose ou gesto (o visor tem o botão `respirar (aditivo)`).
- Apoio das pontes (`mao-taco.json`, no formato do taco da `pose_ponte_v`, mais `apoio`: `tipo` pano|madeira, `ponto_m` e `normal` do plano, `toca`, `pontas_m`, `folgas_ao_plano_mm`, e `elevacao_do_taco_graus`, `altura_do_taco_ao_plano_mm`). O plano é horizontal no referencial da mão; o jogo o alinha ao tampo da mesa e põe a ponta do taco a `ponta_a_ponto_m` do `ponto_m`.
- Contatos (`mao-taco.json`, `tipo: contato`): `gesto_tapinha` (quadros 11 e 20, ponto e plano de contato) e `gesto_palmas` (quadros 8, 16 e 24, plano vertical `x` e `normal_da_palma`).
- O taco, o cubo e o plano de apoio do `.blend` são só prova e não vão no arquivo.

Cuidados que pegam: no Blender 5 a ação é em camadas (`ação.layers[].strips[].channelbags[].fcurves`, não `ação.fcurves`);
`loc` do `pulso` é no referencial do osso (z positivo desce, o lado da palma); `use_nla=False` no esqueleto ao aplicar
uma pose à mão (a pilha NLA vence a pose manual).

## O balão (P1c)

Estilo igual ao da mão: forma de desenho bem feito, acabamento realista de látex brilhante. O balão é a gota de festa do jogo (metade da altura 6,6 cm, raio 4,5 cm,
a mesma silhueta de `apps/web/src/baloes/silhueta.ts`) com o nó e a cordinha de 7,2 cm, em branco para o jogo tingir. O rosto é 3D e vive na mesma malha com pele:
olhos brilhantes (globo, pupila e dois reflexos), pálpebras, sobrancelhas, boca com língua e bochechas. O rosto olha para +Z no glTF (o `yaw = 0` do jogo);
+X é a esquerda do balão. Todos os números em cm estão em `scripts/balao/dados.py` (`CM = 0.01`).

`scripts/balao/` (`00_tudo.py` refaz 01 a 03 do zero, ~1 s: `blender -b --factory-startup --python arte/personagens/scripts/balao/00_tudo.py -- --salvar arte/personagens/balao.blend`):

| Script | O que faz |
| --- | --- |
| `dados.py` | todos os números: corpo, nó, cordinha, olhos, as cinco caras (`CARAS`), esqueleto, pontos das mãos, ação ↔ cara (`PAR_DE_CARA`), trechos de repetição (`TRECHOS`) |
| `geometria.py` | a geometria pura (numpy): `gerar(lod, estado)` devolve vértices, pesos, faces e materiais; a ordem dos vértices é a mesma em toda expressão, por isso a forma sai por diferença. `python3`-puro não roda (o numpy é do Blender): `blender -b --python geometria.py` imprime a contagem |
| `01_malha.py` | `balao_alta` (~2,9 mil tris) e `balao_baixa` (~0,8 mil), 5 materiais, grupos de vértices e as formas (shape keys): base = `cara_neutro`, mais `cara_sorriso`, `cara_susto`, `cara_bravo`, `cara_triste` e `piscar` |
| `02_esqueleto.py` | `balao_esqueleto`: `raiz`, `espinha_1..3`, `no`, `cordinha_1..4`, `olho_esq`/`olho_dir` e o `olhar` (alvo da prévia, fora do .glb); empties `mao_esq`/`mao_dir` filhos da `espinha_2`; liga as duas malhas |
| `03_acoes.py` | as seis ações em Bézier a 30 quadros/s, uma faixa NLA por ação. Escritas pelo que se vê: `T(frente, lado, giro)` inclina o osso para o rosto e para +X, `escala` = (largura, altura, profundidade), `mover` = (direita, cima, frente) em cm; a conversão para os eixos do osso sai do repouso |
| `04_renders.py` | renders EEVEE sem janela: `DISPLAY=:1 blender -b arte/personagens/balao.blend --python arte/personagens/scripts/balao/04_renders.py -- --saida DIR --vistas rosto,corpo,lado,jogo --formas cara_sorriso,piscar=0.5 [--acao balao_pulinho --quadros 4,13,21] [--lod baixa] [--olhar x,y,z] [--yaw 25] [--dist 60 --alvoz 0]` |
| `05_exportar.py` | `exportados/balao.glb` (cor base branca, verniz, 6 morph targets com `extras.targetNames`, 6 animações, sem o osso `olhar`) e `balao-meta.json`; tira dos clipes os canais dos olhos (o jogo mira os olhos) |

Contrato com o jogo (o resto está em `balao-meta.json`):

- Formas (`morphTargetDictionary`): `cara_neutro` (o rosto-base: peso 0 já é neutro; existe só pelo nome), `cara_sorriso`, `cara_susto`, `cara_bravo`, `cara_triste`,
  `piscar`. O GLTFLoader cria um filho por material (5 por versão): aplique o peso em `morphTargetInfluences` de **todos** os filhos de `balao_alta` ou `balao_baixa`. Mostre só uma versão.
  Para piscar com uma cara ligada, multiplique a cara por `1 - piscar`.
- Olhar: gire `olho_esq` e `olho_dir` no referencial do pai (`espinha_2`): no carregamento guarde `quaternion_de_repouso` (o do osso) e `eixo_repouso_no_pai` (o +Z do mundo, que é o `eixo_do_olhar_no_repouso` do meta, levado ao pai); depois do mixer, `q = setFromUnitVectors(eixo_repouso_no_pai, direcao_do_alvo_no_pai)`, no máximo 30°,
  `osso.quaternion = q * quaternion_de_repouso`. O visor tem a conta pronta (`olharPara`).
- Ações (`balao-meta.json` tem os quadros): `balao_parado` (ciclo de 2,6 s), `balao_inclinar` (entra em 0,8 s; repita os quadros 24–84), `balao_pulinho`, `balao_susto`, `balao_estufar` (repita 27–75),
  `balao_murchar` (repita 48–84). Só animam ossos: a cara e os olhos são do jogo (cada ação tem uma cara sugerida em `par_de_cara`).
- Mãos: nós `mao_esq` e `mao_dir` (filhos da `espinha_2`, em ±9,5 cm do centro). Ancore a origem da `mao.glb` neles e escale (a mão tem 22 cm, o balão tem 13 cm de corpo); use só posição e orientação do nó, a escala do pai muda ao estufar.

Visor: `http://127.0.0.1:8731/arte/visor/balao.html` (botões: ações, caras, piscar; o olhar segue o ponteiro; pisca sozinho). Quadro fixo: `?captura&cam=rosto|rosto34|corpo|lado|jogo&acao=balao_pulinho&t=0.4&cara=cara_sorriso:0.7&piscar=0.5&olhar=0.3,0.1,0.5&lod=baixa&yaw=25&dist=0.8&alvoy=0.02`;
sem janela: `bash arte/ferramentas/captura_visor.sh balao SAIDA.png "cam=rosto&cara=cara_sorriso" 520 520`.

## Visor da mão (prova do .glb no three.js)

Na raiz do repositório, servidor estático numa porta livre (nunca a 8001) e abrir o visor; o `three` vem do store do pnpm:

```bash
python3 -m http.server 8731 --bind 127.0.0.1
# http://127.0.0.1:8731/arte/visor/index.html     botões: uma pose por clique, com fade entre elas
# ?captura&pose=pose_punho&cam=cima&t=0.05&lod=baixa&tam=560x420   quadro fixo (cam: cima, tres_quartos, lado, baixo, frente, joinha, jogo_ponte, jogo_punho)
# ?de=pose_repouso&pose=pose_apontar&t=0.15&fade=0.35               a meio do fade (o `t` soma 0,2 s)
# ?captura&de=pose_repouso&pose=gesto_soco_ar&fade=0.2&quadro=13&cam=tres_quartos&seguir=1   o quadro 13 do gesto, depois do fade a partir do repouso (30/s)
# &raio=0.2&alvo=0,0.05,0.05   troca o enquadramento (referencial da mão, m); &seguir=1 centra a câmera na mão naquele instante; &sem-adereco esconde taco e planos
# &respirar=1                  soma o gesto_respirar (aditivo) por cima
```

Capturar sem janela: `google-chrome --headless=new --no-sandbox --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader --virtual-time-budget=6000 --window-size=560,420 --screenshot=SAIDA.png "URL"`.

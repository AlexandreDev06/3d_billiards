"""Os números do balão (contrato v2), em centímetros (a cena do Blender está em metros: `CM`). Origem no centro do corpo, +Z para cima.

O rosto olha para -Y no Blender (vira +Z no glTF, a direção do `yaw = 0` do jogo). A esquerda do balão (`esq`) é o +X.
Tamanho do que o jogo desenha por código hoje (`apps/web/src/config.ts`, `baloes.corpo`): metade da altura 6,6 cm, raio 4,5 cm,
nó 0,66 cm, cordinha 7,2 cm. Essas medidas de repouso não mudam entre as versões do contrato (as mãos e o lugar do balão no jogo dependem delas).
"""
import copy
import math

CM = 0.01
VERSAO = 3          # versão do contrato `balao.glb` + `balao-meta.json` (v3, P8: âncora do chapéu, bigodes, estilos e cores de olho; amplia o v2, nada do v2 muda)

# --- corpo (a mesma gota de `apps/web/src/baloes/silhueta.ts`) ---------------------------------------------------------
METADE_ALTURA = 6.6
RAIO = 4.5
FRACAO_DO_BOJO = 0.58
EXPOENTE_DE_BAIXO = 1.6
EXPOENTE_DE_CIMA = 2.4
# do pescoço para baixo, o funil do nó com a borda enrolada (raio, z em cm); o corpo termina em (RAIO_PESCOCO, -METADE_ALTURA)
RAIO_PESCOCO = 0.34
NO_PERFIL = [(0.36, -7.05), (0.50, -7.55), (0.78, -8.0), (0.96, -8.25), (0.88, -8.52), (0.58, -8.42), (0.34, -8.05)]
NO_FUNDO_Z = -7.95          # onde o funil fecha por dentro
Z_DO_NO = -8.5              # onde a cordinha nasce
# as dobrinhas do nó e o franzido do pescoço: `lobos` pregas, amplitude radial (cm) por altura
NO_LOBOS = 7
NO_AMPLITUDE_PESCOCO = 0.05     # do ombro (z = -4,5) até o pescoço
NO_AMPLITUDE_NO = 0.04          # a mais, no funil e no rolo do nó
NO_TORCAO = 0.55                # giro das pregas por cm de altura (rad): elas não correm retas

# --- cordinha: uma fita de 4 mm que gira (as 4 juntas são os ossos `cordinha_1..4`; quem a balança é o jogo) -------------
CORDINHA_COMPRIMENTO = 7.2
CORDINHA_LARGURA = 0.40
CORDINHA_ESPESSURA = 0.05
CORDINHA_VOLTAS = 1.5           # voltas da fita ao longo do comprimento
CORDINHA_ONDA = [(0.0, 0.0), (0.30, 0.12), (-0.26, -0.10), (0.22, 0.08)]   # (dx, dy) em cm nos 4 pontos da curva
CORDINHA_OSSOS = 4

# --- rosto ------------------------------------------------------------------------------------------------------------
OLHO_X = 1.65               # distância do centro, ao longo da superfície (cm)
OLHO_Z = 1.45
OLHO_RAIO = 1.13            # P7b: o olho do v1 era 1,05 com a pálpebra quase fora; agora o branco visível é pelo menos o do v1 e um pouco maior
OLHO_AFUNDADO = 0.30        # o centro do globo fica tanto para dentro da pele
PUPILA_BASE_GRAUS = 25.0    # abertura da pupila no globo (graus a partir do eixo do olhar) com `pupila = 1`: pupila grande, olho de desenho
IRIS_GRAUS = 41.0           # a borda da íris (o contorno fino termina aqui)
TEXTURA_GRAUS = 100.0       # o disco da textura do olho cobre até aqui (mapa azimutal equidistante)
PALPEBRA_RAIO_SUP = 1.115   # frações do raio do globo: a casca da pálpebra fica um pouco acima dele (P7b: fina, 1,19 inchava o olho)
PALPEBRA_RAIO_INF = 1.09    # a de baixo fica por cima da de cima quando as duas se cruzam
PALPEBRA_BORDA_SUP = 1.010  # onde a borda enrolada encosta no globo (um fio acima, para o erro das somas de formas afundar menos que abrir fresta)
PALPEBRA_BORDA_INF = 1.012
PALPEBRA_EXPOENTE = 0.5     # quão rápido a abertura se fecha para os cantos (cos(psi) ** isto)
PALPEBRA_PSI = 120.0        # a casca vai de -psi a +psi em volta do rosto (o resto fica dentro do corpo)
PALPEBRA_GRAUS_NO_PESO_1 = 12.0   # `palpebra_cima` (+) e `palpebra_baixo` (-): a pálpebra gira tanto em volta do centro do globo
BRILHOS = [(21.0, 128.0, 0.31), (14.0, -52.0, 0.13)]   # (graus do eixo, azimute, raio em cm): reflexo grande no alto à esquerda, pequeno no lado oposto
BRILHO_ALTURA = 0.035       # acima do globo
SOBRA = 0.03                # tudo que é pintado fica um fio acima da pele
SOBRA_BAIXA = 0.05          # a malha baixa tem facetas maiores: a tinta sobe mais

BOCA_Z = -0.55
BOCHECHA_X = 2.55
BOCHECHA_Z = -0.10

# expressões: cada uma é montada por `_cara`. Por olho: pálpebras `sup` e `inf` = (graus no canto de dentro, graus no de fora, graus a mais no meio)
# medidos a partir do alto (sup) e de baixo (inf) do globo (90 fecha no meio; passar de 90 cruza as duas pálpebras); `pupila` (fração);
# `sobr`: yc (altura sobre o olho), incl (canto de dentro → de fora), arco, meia (meio comprimento), x (centro, desde o meio do rosto), esp (espessura).
# Boca: meia (largura), topo/fundo = (y no meio, y nas pontas) relativos a BOCA_Z, `inclina`/`canto` (a ponta de +X sobe), `x0` (desloca),
# `lingua` (altura), `lingua_fora` (a ponta que passa do lábio de baixo), `lingua_x`/`lingua_larg`, `dentes` (altura da fileira de cima).
SOBR_BASE = dict(yc=1.80, incl=0.0, arco=0.14, meia=0.88, x=1.70, esp=1.0)
BOCA_BASE = dict(meia=1.10, topo=(0.06, 0.40), fundo=(-0.16, 0.28), inclina=0.0, canto=0.0, x0=0.0,
                 lingua=0.0, lingua_fora=0.0, lingua_x=0.0, lingua_larg=0.5, dentes=0.0)
# P7b: o olho FECHADO não é a pálpebra por cima do globo (virava uma bolota inchada): o globo e as pálpebras afundam `SINK_FECHADO` cm na pele
# (`fecha` = 1) e uma fita escura sobe à pele no lugar: o arco "^ ^" do desenho, com um cílio na ponta de fora. Aberto, a fita fica por baixo da pele.
SINK_FECHADO = 1.65        # cm ao longo da normal da pele (o globo tem 0,30 afundado e 1,13 de raio: o topo da casca da pálpebra vai a 0,55 cm abaixo da pele, o que cobre a soma dos erros das formas)
SINK_FITA = 0.50           # a fita do olho fechado fica tanto abaixo da pele quando o olho está aberto
# a fita: `arco` (altura do meio sobre os cantos, cm; negativo = "u"), `meia` (meio comprimento), `esp` (espessura), `cilio` (comprimento do cílio, 1 = normal), `z` (altura dos cantos sobre o olho)
LINHA_BASE = dict(arco=0.40, meia=1.02, esp=1.0, cilio=1.0, z=-0.10)
LINHA_PISCAR = dict(arco=-0.10, meia=1.00, esp=0.9, cilio=0.6, z=-0.05)

# --- P8: estilos de olho, cores de olho, bigodes e a âncora do chapéu -------------------------------------------------------------
# reflexos por estilo: (graus a partir do eixo do olhar, azimute, raio em cm). Há `VAGAS_DE_REFLEXO` vagas por olho (a malha baixa usa as duas primeiras);
# a vaga sem uso fica sob o globo (raio 0). Os reflexos ficam presos à cabeça (`espinha_2`), não ao osso do olho.
VAGAS_DE_REFLEXO = 4
BRILHOS_ESTILO = {
    "olho_normal": [(21.0, 128.0, 0.31), (14.0, -52.0, 0.13)],
    "olho_kawaii": [(19.0, 126.0, 0.40), (12.0, -54.0, 0.21), (31.0, 38.0, 0.10), (27.0, -104.0, 0.075)],
    "olho_bravo": [(24.0, 132.0, 0.24), (13.0, -50.0, 0.085)],
    "olho_cansado": [(20.0, 130.0, 0.20)],
}
SINK_EST = 1.65                   # a pálpebra do estilo afunda tanto na pele (ao longo da normal, depois de girar) quando o estilo não a liga; o olho fechado afunda mais um tanto, como o globo
PALPEBRA_RAIO_EST = 1.075         # a casca fica entre o globo (1,0) e a pálpebra da cara (1,115): onde a da cara cobre, ela some atrás
PALPEBRA_BORDA_EST = 1.012
OLHEIRA_R_IN = 1.32               # a olheira é um crescente na pele sob o olho: raio de dentro, espessura no meio e abertura (graus) em volta do pé do olho
OLHEIRA_ESP = 0.44
OLHEIRA_ABERTURA = 64.0
SINK_OLHEIRA = 0.55               # escondida, a olheira fica tanto abaixo da pele
IRIS_ALTURA = 0.012               # a íris tingível é uma segunda pele sobre o globo, um fio acima dele (cm)

# cada estilo: o que é somado ao olho do neutro (formas `estilo_<id>`): `iris_k` (escala angular da íris), `pupila_k`, `est` (a pálpebra de cima do estilo: canto de dentro,
# canto de fora, mais no meio, em graus a partir do alto), `olheira`, `sobr` (somado à sobrancelha) e os reflexos
ESTILOS = {
    "olho_normal": dict(iris_k=1.0, pupila_k=1.0, est=None, olheira=0.0, sobr={}),
    "olho_kawaii": dict(iris_k=1.30, pupila_k=1.22, est=None, olheira=0.0, sobr=dict(yc=0.16, arco=0.04)),
    "olho_bravo": dict(iris_k=1.0, pupila_k=0.92, est=(52.0, 22.0, 0.0), olheira=0.0, sobr=dict(incl=0.30, yc=-0.12)),
    "olho_cansado": dict(iris_k=0.94, pupila_k=0.80, est=(46.0, 54.0, 2.0), olheira=1.0, sobr=dict(incl=-0.20, yc=-0.14)),
}
for _id, _e in ESTILOS.items():
    _e["id"] = _id
    _e["brilhos"] = BRILHOS_ESTILO[_id]
IDS_DE_ESTILO = list(ESTILOS)
CHAVES_DA_PALPEBRA_DE_ESTILO = ["est_" + i[len("olho_"):] for i in IDS_DE_ESTILO if ESTILOS[i]["est"] is not None]     # cada estilo com pálpebra tem a sua, sempre no mesmo formato: o giro do olhar soma sem emenda
FORMAS_DE_ESTILO = ["estilo_" + i[len("olho_"):] for i in IDS_DE_ESTILO if i != "olho_normal"]   # o normal é o corpo sem forma

# a cor do olho tinge a íris (cinza no arquivo): `cor` é o tom do cinza 1,0 (junto da pupila); a íris fica de 45 a 100 por cento dele (média perto de 75).
# `centro` e `borda` são o par para quem quiser um gradiente (a borda é mais escura e puxa o matiz).
CORES_DE_OLHO = {
    "castanho": dict(cor="#B0702F", centro="#D69A52", borda="#5A3414"),
    "mel": dict(cor="#F2AE24", centro="#FFD067", borda="#A8620C"),
    "verde": dict(cor="#3FC263", centro="#8FE39A", borda="#17673A"),
    "azul": dict(cor="#3F9CFF", centro="#9BD0FF", borda="#1B4FA8"),
    "cinza": dict(cor="#BAC2CC", centro="#E4E9EE", borda="#566170"),
    "violeta": dict(cor="#A060FF", centro="#CBA6FF", borda="#4F2599"),
    "vermelho": dict(cor="#FF4141", centro="#FF9A8A", borda="#8E1426"),
    "dourado": dict(cor="#FFD43D", centro="#FFF09A", borda="#B07A0A"),
}
COR_PADRAO_DE_OLHO = "castanho"

# a âncora do chapéu: um nó no topo da cabeça, filho do osso que acompanha o topo no estica e amassa (+Z do Blender = +Y do glTF, para fora da cabeça)
ANCORA_CHAPEU = dict(nome="ancora_chapeu", osso="espinha_3", pos=(0.0, 0.0, METADE_ALTURA))

# a regra da escala do chapéu (medida em `chapeus/provas_chapeus.py`): o chapéu é filho de `ancora_chapeu` e herda a escala do osso; o jogo a compensa por eixo
# `segue`: quanto da escala do osso (1 = tudo, 0 = nada) o chapéu acompanha em cada eixo; `teto`/`piso`: limites da escala final do chapéu
ESCALA_DO_CHAPEU = dict(
    formula="escala_final = clamp(1 + segue * (escala_do_no - 1), piso, teto); escala_local_do_chapeu = escala_final / escala_do_no (em cada eixo, a escala do nó vista no mundo)",
    largura=dict(segue=0.65, piso=0.88, teto=1.32), altura=dict(segue=0.30, piso=0.88, teto=1.14),
)

# bigodes: cada um é uma lista de fitas (ver `bigodes.py`); a cor é fixa por item (não tinge com a equipe)
IDS_DE_BIGODE = ["bigode_fino", "bigodao", "bigode_guidao", "bigode_dali", "bigode_chevron"]
COR_DO_BIGODE = {"bigode_fino": "preto", "bigodao": "castanho", "bigode_guidao": "grisalho", "bigode_dali": "preto", "bigode_chevron": "castanho"}


def _olho(sup, inf, pupila=1.0, fecha=0.0, linha=None, **sobr):
    s = dict(SOBR_BASE)
    s.update(sobr)
    l = dict(LINHA_BASE)
    l.update(linha or {})
    # P8: o que o estilo de olho muda (o `olho_normal` é o de hoje): `iris_k` (a íris e a pupila crescem em volta do eixo do olhar), `brilhos` (os reflexos, em vagas),
    # `est_on` (por estilo com pálpebra própria: 1 = a pálpebra do estilo à mostra, 0 = escondida sob a pele; o formato de cada uma é fixo, em `ESTILOS[...]["est"]`) e `olheira` (0 a 1)
    return dict(sup=tuple(sup), inf=tuple(inf), pupila=pupila, sobr=s, fecha=fecha, linha=l,
                iris_k=1.0, brilhos=tuple(BRILHOS_ESTILO["olho_normal"]), est_on={c: 0.0 for c in CHAVES_DA_PALPEBRA_DE_ESTILO}, olheira=0.0)


def _boca(**kw):
    b = copy.deepcopy(BOCA_BASE)
    b.update(kw)
    return b


def _cara(esq, dir=None, boca=None, bochecha=0.30):
    """`esq` é o olho de +X; sem `dir`, o olho de -X é o mesmo. `bochecha` pode ser (esq, dir)."""
    bo = tuple(bochecha) if isinstance(bochecha, (tuple, list)) else (bochecha, bochecha)
    return dict(esq=esq, dir=copy.deepcopy(esq) if dir is None else dir, boca=boca or _boca(), bochecha=bo, rot_palpebras=0.0)


FECHADO = ((105, 105, 0), (75, 75, 0))       # as pálpebras (de cima, de baixo) se encontram um pouco abaixo do meio do globo; no olho fechado ficam por baixo da pele

# P7b: o olho aberto do neutro é o do v1 (pálpebra de cima a 30 graus do alto e a de baixo a 6 do fundo: o círculo inteiro, com branco acima da íris).
# A pálpebra só cobre o olho onde a cara pede: tédio, concentrado, desconfiado e convencido (e o canto de cima do bravo e do triste, que é o que os faz bravo e triste).
CARAS = {
    "cara_neutro": _cara(_olho((24, 24, 0), (3, 3, 0)), boca=_boca(meia=1.12, topo=(0.06, 0.40), fundo=(-0.16, 0.28)), bochecha=0.62),
    "cara_sorriso": _cara(
        _olho((34, 34, 0), (14, 16, 0), pupila=1.05, yc=2.05, incl=-0.05, arco=0.36, meia=0.9),
        boca=_boca(meia=1.8, topo=(0.40, 0.64), fundo=(-1.25, 0.46), lingua=0.62, dentes=0.30), bochecha=1.18),
    "cara_susto": _cara(
        _olho((6, 6, 0), (4, 4, 0), pupila=0.5, yc=2.50, incl=0.12, arco=0.46, meia=0.82),
        boca=_boca(meia=0.62, topo=(0.62, 0.02), fundo=(-0.72, -0.04)), bochecha=0.0),
    "cara_bravo": _cara(
        _olho((64, 34, 0), (12, 10, 0), pupila=0.88, yc=1.55, incl=0.62, arco=0.0, meia=0.95, x=1.55, esp=1.35),
        boca=_boca(meia=1.0, topo=(0.10, -0.14), fundo=(-0.04, -0.28)), bochecha=0.0),
    "cara_triste": _cara(
        _olho((22, 60, 0), (8, 8, 0), pupila=1.14, yc=1.75, incl=-0.52, arco=0.05),
        boca=_boca(meia=0.70, topo=(0.14, -0.14), fundo=(0.02, -0.26)), bochecha=0.42),
    "cara_rindo": _cara(
        _olho(*FECHADO, pupila=0.9, fecha=1.0, linha=dict(arco=0.42, meia=1.0, cilio=1.0), yc=1.95, incl=-0.10, arco=0.46, meia=0.9),
        boca=_boca(meia=1.95, topo=(0.42, 0.70), fundo=(-1.60, 0.50), lingua=0.85, dentes=0.42), bochecha=1.40),
    "cara_convencido": _cara(
        _olho((46, 46, 0), (14, 14, 0), yc=2.55, incl=-0.12, arco=0.55, meia=0.92),
        _olho((58, 58, 0), (20, 20, 0), pupila=0.95, yc=1.52, incl=0.30, arco=0.0, meia=0.95, esp=1.1),
        boca=_boca(meia=1.5, topo=(0.06, 0.40), fundo=(-0.30, 0.28), inclina=0.14, canto=0.50, x0=0.2, dentes=0.0), bochecha=(0.95, 0.30)),
    # foco, não raiva: sobrancelhas quase retas (a de -X um pouco mais baixa), os dois olhos semicerrados por igual, a boca apertada de lado e a pontinha da língua
    "cara_concentrado": _cara(
        _olho((50, 50, 0), (26, 26, 0), pupila=0.88, yc=1.82, incl=0.02, arco=0.05, meia=0.9, esp=1.1),
        _olho((50, 50, 0), (26, 26, 0), pupila=0.88, yc=1.62, incl=0.06, arco=0.03, meia=0.9, esp=1.1),
        boca=_boca(meia=0.66, topo=(-0.02, 0.0), fundo=(-0.16, -0.08), x0=0.6, lingua=0.0, lingua_fora=0.26, lingua_x=0.62, lingua_larg=0.42),
        bochecha=0.0),
    "cara_desconfiado": _cara(
        _olho((44, 44, 0), (16, 16, 0), pupila=0.95, yc=2.45, incl=-0.20, arco=0.55, meia=0.9),
        _olho((60, 60, 0), (24, 24, 0), pupila=0.88, yc=1.45, incl=0.45, arco=0.0, meia=0.95, esp=1.15),
        boca=_boca(meia=0.85, topo=(-0.06, -0.20), fundo=(-0.20, -0.30), inclina=-0.12, x0=-0.15), bochecha=0.0),
    "cara_ufa": _cara(
        _olho((50, 50, 0), (10, 10, 0), pupila=1.0, yc=1.98, incl=-0.35, arco=0.14),
        boca=_boca(meia=0.52, topo=(0.42, 0.02), fundo=(-0.46, -0.02)), bochecha=0.80),
    "cara_tedio": _cara(
        _olho((56, 56, 0), (14, 14, 0), pupila=0.9, yc=1.55, incl=0.10, arco=0.04, meia=0.9),
        boca=_boca(meia=0.80, topo=(-0.02, -0.06), fundo=(-0.14, -0.18), inclina=-0.05), bochecha=0.0),
    "cara_comemorando": _cara(
        _olho(*FECHADO, pupila=1.0, fecha=1.0, linha=dict(arco=0.52, meia=1.08, esp=1.1, cilio=1.25), yc=2.05, incl=-0.10, arco=0.50, meia=0.92),
        boca=_boca(meia=1.95, topo=(0.50, 0.75), fundo=(-1.75, 0.55), lingua=0.95, dentes=0.48), bochecha=1.48),
}
NOME_DA_BASE = "cara_neutro"


# o maior multiplicador de `palpebra_cima`/`palpebra_baixo` que a cara aguenta sem a pálpebra afundar no globo (> 0,08 cm) nem abrir fresta (> 0,07 cm):
# medido por `provas_olhos.py` (`abertura_segura`, passo de 0,05); só as caras onde o limite é menor que a abertura visual
ABERTURA_SEGURA = {"cara_bravo": 0.55, "cara_triste": 0.70, "cara_convencido": 0.45, "cara_concentrado": 0.60, "cara_desconfiado": 0.45, "cara_ufa": 0.60, "cara_tedio": 0.50}


def abertura_da_cara(nome):
    """Quanto o olho está aberto nesta cara, de 0 (fechado) a 1 (como o neutro ou mais): a média dos dois olhos, a abertura vertical no meio / a do neutro,
    no máximo `ABERTURA_SEGURA`.

    As formas `palpebra_cima` e `palpebra_baixo` são somadas à cara e o erro delas cresce com o quanto a cara já moveu as pálpebras: o jogo as multiplica por isto."""
    c = CARAS[nome]
    ab = lambda o: max(180.0 - (o["sup"][0] + o["sup"][1]) / 2 - o["sup"][2] - (o["inf"][0] + o["inf"][1]) / 2 - o["inf"][2], 0.0) * (1.0 - o["fecha"])
    neutro = ab(CARAS[NOME_DA_BASE]["esq"])
    return round(min((ab(c["esq"]) + ab(c["dir"])) / 2 / neutro, 1.0, ABERTURA_SEGURA.get(nome, 1.0)), 3)


def _aplicar_estilo(o, est):
    """Põe no olho (um dos dois) o que o estilo muda: o neutro com o estilo ligado é o que a forma `estilo_<id>` guarda."""
    o["iris_k"] = est["iris_k"]
    o["pupila"] = o["pupila"] * est["pupila_k"]
    o["brilhos"] = tuple(est["brilhos"])
    o["olheira"] = est["olheira"]
    if est["est"] is not None:
        o["est_on"]["est_" + est["id"][len("olho_"):]] = 1.0
    for k, dv in est["sobr"].items():
        o["sobr"][k] = o["sobr"][k] + dv


def estado_da_forma(nome):
    """O estado inteiro da malha para cada forma (shape key). A base é `cara_neutro`; cada forma é um estado completo."""
    e = copy.deepcopy(CARAS[NOME_DA_BASE if nome not in CARAS else nome])
    if nome in ("piscar", "piscar_esq", "piscar_dir"):
        for lado in (("esq", "dir") if nome == "piscar" else (nome[-3:],)):
            e[lado]["sup"], e[lado]["inf"] = FECHADO
            e[lado]["fecha"] = 1.0
            e[lado]["linha"] = dict(LINHA_PISCAR)
    elif nome in FORMAS_DE_ESTILO:
        est = ESTILOS["olho_" + nome[len("estilo_"):]]
        for lado in ("esq", "dir"):
            _aplicar_estilo(e[lado], est)
    elif nome == "palpebra_cima":
        e["rot_palpebras"] = PALPEBRA_GRAUS_NO_PESO_1
    elif nome == "palpebra_baixo":
        e["rot_palpebras"] = -PALPEBRA_GRAUS_NO_PESO_1
    elif nome not in CARAS:
        raise KeyError(nome)
    return e


# a ordem do arquivo: as seis formas do v1 primeiro (nada do v1 some), depois as novas
FORMAS_V2 = ["cara_neutro", "cara_sorriso", "cara_susto", "cara_bravo", "cara_triste", "piscar",
             "cara_rindo", "cara_convencido", "cara_concentrado", "cara_desconfiado", "cara_ufa", "cara_tedio", "cara_comemorando",
             "piscar_esq", "piscar_dir", "palpebra_cima", "palpebra_baixo"]
FORMAS = FORMAS_V2 + FORMAS_DE_ESTILO      # P8: as 17 do v2 ficam na frente, na mesma ordem; as formas de estilo vêm depois

# --- esqueleto (z da cabeça, z da cauda; cm) ---------------------------------------------------------------------------
OSSOS = {
    "raiz": ((0, 0, -1.0), (0, 0, 1.5), None),
    "espinha_1": ((0, 0, -6.6), (0, 0, -1.0), "raiz"),      # a base gira e escala no pescoço: o balão balança preso ao nó
    "espinha_2": ((0, 0, -1.0), (0, 0, 2.6), "espinha_1"),
    "espinha_3": ((0, 0, 2.6), (0, 0, 6.6), "espinha_2"),
    "no": ((0, 0, -7.0), (0, 0, -8.5), "raiz"),             # o nó não escala com o corpo
}
LIMITE_DO_OLHAR = 34.0      # graus em cada eixo (a íris continua visível, 84% ou mais: `provas_olhos.py`)
PONTOS_DAS_MAOS = {"mao_esq": (9.5, -1.8, -1.2), "mao_dir": (-9.5, -1.8, -1.2)}   # filhos de `espinha_2`

# --- cores de prévia (o .glb leva látex branco, o jogo tinge) ----------------------------------------------------------------
COR_PREVIA = (0.23, 0.63, 1.0)

# --- ações ------------------------------------------------------------------------------------------------------------------
# o rosto que combina com cada ação (o jogo escolhe; a folha de prova usa estes)
PAR_DE_CARA = {
    "balao_parado": "cara_neutro", "balao_inclinar": "cara_neutro", "balao_pulinho": "cara_sorriso",
    "balao_susto": "cara_susto", "balao_estufar": "cara_sorriso", "balao_murchar": "cara_triste",
    "balao_comemorar": "cara_comemorando", "balao_rir": "cara_rindo", "balao_bravo": "cara_bravo",
    "balao_concentrar": "cara_concentrado", "balao_impaciente": "cara_tedio", "balao_ufa": "cara_ufa", "balao_desanimar": "cara_triste",
}
# trechos de repetição, em quadros (`03_acoes.py` confere que as ações têm exatamente estes ciclos): o resto toca uma vez e segura o último quadro
TRECHOS = {
    "balao_parado": {"ciclo": (0, 180)}, "balao_inclinar": {"entrada": (0, 24), "ciclo": (24, 96)},
    "balao_pulinho": {}, "balao_susto": {}, "balao_estufar": {"entrada": (0, 27), "ciclo": (27, 75)},
    "balao_murchar": {"entrada": (0, 48), "ciclo": (48, 96)},
    "balao_comemorar": {}, "balao_rir": {"entrada": (0, 15), "ciclo": (15, 51)}, "balao_bravo": {},
    "balao_concentrar": {"entrada": (0, 30), "ciclo": (30, 114)}, "balao_impaciente": {"entrada": (0, 18), "ciclo": (18, 78)},
    "balao_ufa": {}, "balao_desanimar": {},
}
ACOES_DO_V1 = ["balao_parado", "balao_inclinar", "balao_pulinho", "balao_susto", "balao_estufar", "balao_murchar"]
ACOES_NOVAS = ["balao_comemorar", "balao_rir", "balao_bravo", "balao_concentrar", "balao_impaciente", "balao_ufa", "balao_desanimar"]

# o que cada ação conta (vai para o meta; o jogo escolhe quando tocar)
DESCRICAO_DAS_ACOES = {
    "balao_parado": "respira e balança devagar, sem repetir o gesto (ciclo longo de 6 s, com várias frequências); a base de tudo",
    "balao_inclinar": "o balão se inclina para o lado da jogada (entra em 0,8 s, depois balança de leve preso ao nó)",
    "balao_pulinho": "agacha, sobe em arco, passa do ponto e assenta (o de alegria pequena)",
    "balao_susto": "encolhe de um golpe, treme e relaxa",
    "balao_estufar": "enche o peito (fica 35 por cento maior) e segura respirando",
    "balao_murchar": "afunda devagar, vira de lado e fica murcho",
    "balao_comemorar": "dois pulos com giro de lado a lado, um aperto no alto e um assentar",
    "balao_rir": "arqueia para trás e sacode em soluços de riso (a parte que repete)",
    "balao_bravo": "enche, treme de raiva e solta o ar de uma vez (bufa)",
    "balao_concentrar": "inclina para o alvo e respira devagar (a parte que repete)",
    "balao_impaciente": "passa o peso de um lado para o outro e dá pulinhos de espera (a parte que repete)",
    "balao_ufa": "enche o peito e solta o ar aliviado, afundando um pouco",
    "balao_desanimar": "os ombros caem, o balão se inclina para o lado e baixa",
}

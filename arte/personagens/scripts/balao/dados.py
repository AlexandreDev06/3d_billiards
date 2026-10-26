"""Os números do balão, em centímetros (a cena do Blender está em metros: `CM`). Origem no centro do corpo, +Z para cima.

O rosto olha para -Y no Blender (vira +Z no glTF, a direção do `yaw = 0` do jogo). A esquerda do balão (`esq`) é o +X.
Tamanho do que o jogo desenha por código hoje (`apps/web/src/config.ts`, `baloes.corpo`): metade da altura 6,6 cm, raio 4,5 cm,
nó 0,66 cm, cordinha 7,2 cm.
"""
import math

CM = 0.01

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

# --- cordinha ---------------------------------------------------------------------------------------------------------
CORDINHA_COMPRIMENTO = 7.2
CORDINHA_RAIO = 0.22
CORDINHA_ONDA = [(0.0, 0.0), (0.9, 0.35), (-0.8, -0.3), (0.7, 0.2)]   # (dx, dy) em cm nos 4 pontos da curva
CORDINHA_OSSOS = 4

# --- rosto ------------------------------------------------------------------------------------------------------------
OLHO_X = 1.65               # distância do centro, ao longo da superfície (cm)
OLHO_Z = 1.45
OLHO_RAIO = 1.05
OLHO_AFUNDADO = 0.30        # o centro do globo fica tanto para dentro da pele
PUPILA_RAIO_GRAUS = 31.0    # abertura da pupila no globo (graus a partir do eixo do olhar)
GLOBO_ABERTURA = 98.0       # o globo é uma cúpula até esse ângulo (o olhar é paralelo, a pele é inclinada: sobra para tapar a borda)
PALPEBRA_RAIO = 1.16        # fração do raio do globo
BRILHO_GRAUS = (17.0, 128.0)  # onde o reflexo mora no globo: (distância do eixo, azimute)
BRILHO_RAIO = 0.27
SOBRA = 0.03                # tudo que é pintado fica um fio acima da pele

SOBRANCELHA_ESPESSURA = 0.34
BOCA_Z = -0.55
BOCHECHA_X = 2.9
BOCHECHA_Z = 0.0

# expressões: cada uma é um dicionário completo (o estado base é `cara_neutro`)
# sobrancelha: yc (altura sobre o olho), inclinacao (interna → externa), arco, meia (meio comprimento), x (centro, partindo do meio do rosto)
# palpebra: (graus da interna, graus da externa) a partir do topo (superior) e de baixo (inferior)
# boca: meia largura; topo e fundo = (y no meio, y nas pontas) relativos a BOCA_Z; lingua: altura (cm)
# pupila: fração da abertura; bochecha: raio
CARAS = {
    "cara_neutro": dict(
        sobrancelha=dict(yc=1.80, inclinacao=0.0, arco=0.14, meia=0.88, x=1.70),
        palpebra_sup=(30.0, 30.0), palpebra_inf=(6.0, 6.0),
        boca=dict(meia=0.95, topo=(0.05, 0.22), fundo=(-0.07, 0.15), lingua=0.0),
        pupila=1.0, bochecha=0.30),
    "cara_sorriso": dict(
        sobrancelha=dict(yc=2.05, inclinacao=-0.05, arco=0.36, meia=0.9, x=1.70),
        palpebra_sup=(52.0, 52.0), palpebra_inf=(34.0, 46.0),
        boca=dict(meia=1.45, topo=(0.30, 0.52), fundo=(-1.05, 0.40), lingua=0.55),
        pupila=1.05, bochecha=0.80),
    "cara_susto": dict(
        sobrancelha=dict(yc=2.50, inclinacao=0.12, arco=0.46, meia=0.82, x=1.70),
        palpebra_sup=(4.0, 4.0), palpebra_inf=(3.0, 3.0),
        boca=dict(meia=0.62, topo=(0.62, 0.02), fundo=(-0.72, -0.04), lingua=0.0),
        pupila=0.52, bochecha=0.0),
    "cara_bravo": dict(
        sobrancelha=dict(yc=1.45, inclinacao=0.62, arco=0.0, meia=0.95, x=1.55),
        palpebra_sup=(66.0, 30.0), palpebra_inf=(14.0, 10.0),
        boca=dict(meia=1.0, topo=(0.10, -0.14), fundo=(-0.04, -0.28), lingua=0.0),
        pupila=0.88, bochecha=0.0),
    "cara_triste": dict(
        sobrancelha=dict(yc=1.75, inclinacao=-0.52, arco=0.05, meia=0.9, x=1.70),
        palpebra_sup=(20.0, 62.0), palpebra_inf=(8.0, 8.0),
        boca=dict(meia=0.70, topo=(0.14, -0.14), fundo=(0.02, -0.26), lingua=0.0),
        pupila=1.14, bochecha=0.42),
}
NOME_DA_BASE = "cara_neutro"
# o que `piscar` soma: as duas pálpebras se encontram no meio do globo (graus)
PISCAR = dict(palpebra_sup=(90.0, 90.0), palpebra_inf=(90.0, 90.0))

# --- esqueleto (z da cabeça, z da cauda; cm) ---------------------------------------------------------------------------
OSSOS = {
    "raiz": ((0, 0, -1.0), (0, 0, 1.5), None),
    "espinha_1": ((0, 0, -6.6), (0, 0, -1.0), "raiz"),      # a base gira e escala no pescoço: o balão balança preso ao nó
    "espinha_2": ((0, 0, -1.0), (0, 0, 2.6), "espinha_1"),
    "espinha_3": ((0, 0, 2.6), (0, 0, 6.6), "espinha_2"),
    "no": ((0, 0, -7.0), (0, 0, -8.5), "raiz"),             # o nó não escala com o corpo
}
LIMITE_DO_OLHAR = 30.0      # graus em cada eixo
PONTOS_DAS_MAOS = {"mao_esq": (9.5, -1.8, -1.2), "mao_dir": (-9.5, -1.8, -1.2)}   # filhos de `espinha_2`

# --- cores de prévia (o .glb leva látex branco, o jogo tinge) ----------------------------------------------------------------
COR_PREVIA = (0.23, 0.63, 1.0)

# --- ações ------------------------------------------------------------------------------------------------------------------
# o rosto que combina com cada ação (o jogo escolhe; a folha de prova usa estes)
PAR_DE_CARA = {
    "balao_parado": "cara_neutro", "balao_inclinar": "cara_neutro", "balao_pulinho": "cara_sorriso",
    "balao_susto": "cara_susto", "balao_estufar": "cara_sorriso", "balao_murchar": "cara_triste",
}
# trechos de repetição, em quadros: o resto toca uma vez e segura o último quadro
TRECHOS = {
    "balao_parado": {"ciclo": (0, 78)}, "balao_inclinar": {"entrada": (0, 24), "ciclo": (24, 84)},
    "balao_pulinho": {}, "balao_susto": {}, "balao_estufar": {"entrada": (0, 27), "ciclo": (27, 75)},
    "balao_murchar": {"entrada": (0, 48), "ciclo": (48, 84)},
}

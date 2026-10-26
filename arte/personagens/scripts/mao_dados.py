"""Medidas da mão cartum (luva de desenho clássico). Tudo em centímetros, o resto converte.

Mão direita, palma para baixo (-Z), dedos em +Y, polegar em -X, dorso em +Z.
Origem no pulso: o ponto onde o punho enrolado encontra a mão. A esquerda é o espelho (escala X = -1 no jogo).
"""
import math

CM = 0.01  # centímetro em metros: a cena e o .glb ficam em metros

# Cor da equipe azul do jogo (cena/cores-da-equipe.ts, 0x3aa0ff), só para a prévia; o .glb sai com cor base branca.
def _linear(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


COR_PREVIA = (_linear(0x3A), _linear(0xA0), _linear(0xFF))  # linear: o Blender converte para sRGB na tela

# Dedos: raiz (articulação da palma), ângulo de abertura em graus (+ vai para o mínimo), comprimento total até a
# ponta, divisão das três falanges e raio do cilindro roliço (o mesmo do começo ao fim). Os centros em x saem dos
# raios e do vão entre dedos: a borda dos nós da palma é simétrica e os dedos nunca se encostam.
_VAO = 0.32
_RAIOS = {"indicador": 1.25, "medio": 1.28, "anelar": 1.22, "minimo": 1.08}
_X = -(2 * sum(_RAIOS.values()) + 3 * _VAO) / 2
_CENTROS = {}
for _n, _r in _RAIOS.items():
    _CENTROS[_n] = _X + _r
    _X += 2 * _r + _VAO

DEDOS = {
    "indicador": dict(raiz=(_CENTROS["indicador"], 9.0, 0.0), ang=-5.0, comp=7.4, div=(0.46, 0.31, 0.23), raio=_RAIOS["indicador"]),
    "medio": dict(raiz=(_CENTROS["medio"], 9.6, 0.0), ang=-1.5, comp=8.5, div=(0.46, 0.31, 0.23), raio=_RAIOS["medio"]),
    "anelar": dict(raiz=(_CENTROS["anelar"], 9.2, 0.0), ang=2.5, comp=7.7, div=(0.46, 0.31, 0.23), raio=_RAIOS["anelar"]),
    "minimo": dict(raiz=(_CENTROS["minimo"], 8.2, 0.0), ang=7.0, comp=6.0, div=(0.47, 0.30, 0.23), raio=_RAIOS["minimo"]),
}

# Polegar gordo: raiz na base da palma, ângulo para fora (+ vai para -X), três ossos.
POLEGAR = dict(raiz=(-3.2, 3.0, -0.1), ang=40.0, comp=9.0, div=(0.42, 0.33, 0.25), raio=1.70, raio_base=2.0)

# A gaiola de quadriláteros da mão (01_gaiola.py): estações da palma (fração do comprimento, meia largura, meia
# espessura, em cm), vão entre dedos, cota da borda dos nós e o quanto o desenho engorda para a subdivisão
# (Catmull-Clark encolhe a seção em ~8%).
GAIOLA = dict(
    vao=_VAO,
    estacoes=[(0.0, 3.00, 1.65), (0.15, 3.25, 1.75), (0.33, 4.40, 1.88), (0.55, 5.20, 1.95), (0.78, 5.30, 1.90), (1.0, 5.30, 1.85)],
    y_pulso=0.0,
    y_nos=8.8,
    descida_da_borda=0.45,   # a base do dedo fica abaixo da articulação da palma
    expoente=4.0,            # seção da palma: retângulo arredondado (superelipse)
    engorda=1.105,
    ponta=0.05,              # compensa o encolhimento da ponta em domo
    cintura=0.975,           # o nó do dedo é uma dobra suave: raio nas juntas
)

# Punho enrolado de luva, grande e aberto como o da referência do usuário: perfil (deslocamento do raio em cm, y em cm)
# sobre a elipse do pulso (a, b). Parede de fora que se abre, borda enrolada e só um palmo de parede de dentro; o fundo é uma
# tampa côncava (`PUNHO_FUNDO`), do mesmo látex num tom mais escuro, e não um tubo oco: nenhuma vista do jogo mostra o vazio.
PUNHO_ELIPSE = (3.0, 1.8)
PUNHO_PERFIL = [
    (-0.30, 1.30), (0.05, 0.40), (0.25, -0.35), (0.45, -1.20), (0.65, -2.00), (0.90, -2.70),   # parede de fora
    (1.15, -3.15), (1.20, -3.65), (0.85, -3.95), (0.50, -3.65),                                 # borda enrolada
    (0.40, -3.25),                                                                              # parede de dentro (curta)
]
# a tampa: anéis que encolhem de 1 até 0 (fração da elipse da boca) e afundam como um prato raso (cm, para dentro da mão)
PUNHO_FUNDO = dict(aneis=(0.78, 0.5, 0.24), fundura=0.9, escuro=0.42)


def direcao(ang_graus):
    """Vetor do dedo no plano da palma: 0 é +Y, positivo abre para +X."""
    a = math.radians(ang_graus)
    return (math.sin(a), math.cos(a), 0.0)

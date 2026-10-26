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

# Dedos: raiz (articulação da palma), ângulo de abertura em graus (+ vai para o mínimo), comprimento
# total até a ponta, divisão das três falanges e raio do cilindro roliço. Dedos grossos de luva.
DEDOS = {
    "indicador": dict(raiz=(-3.9, 9.0, 0.0), ang=-7.0, comp=7.4, div=(0.46, 0.31, 0.23), raio=1.30),
    "medio": dict(raiz=(-1.3, 9.6, 0.0), ang=-1.5, comp=8.5, div=(0.46, 0.31, 0.23), raio=1.34),
    "anelar": dict(raiz=(1.3, 9.2, 0.0), ang=5.0, comp=7.7, div=(0.46, 0.31, 0.23), raio=1.27),
    "minimo": dict(raiz=(3.75, 8.2, 0.0), ang=12.0, comp=6.0, div=(0.47, 0.30, 0.23), raio=1.12),
}

# Polegar gordo: raiz na base da palma, ângulo para fora (+ vai para -X), três ossos.
POLEGAR = dict(raiz=(-3.2, 3.0, -0.1), ang=40.0, comp=9.0, div=(0.42, 0.33, 0.25), raio=1.62, raio_base=1.95)

# Palma fofa e cheia: elipsoides macios (centro e meias-medidas visíveis, em cm): o corpo da palma, a faixa dos
# nós dos dedos, o pulso que fecha no punho e o monte do polegar.
PALMA = [
    dict(centro=(0.0, 4.9, 0.0), meia=(4.9, 4.7, 1.9)),
    dict(centro=(0.0, 0.7, 0.0), meia=(3.0, 1.8, 1.75)),
]

# Punho enrolado de luva, grande e aberto como o da referência do usuário: perfil (deslocamento do raio em cm, y em cm)
# sobre a elipse do pulso (a, b). Parede de fora que se abre, borda enrolada, parede de dentro e fundo oco.
PUNHO_ELIPSE = (3.0, 1.8)
PUNHO_PERFIL = [
    (-0.30, 1.30), (0.05, 0.40), (0.25, -0.35), (0.45, -1.20), (0.65, -2.00), (0.90, -2.70),   # parede de fora
    (1.15, -3.15), (1.20, -3.65), (0.85, -3.95), (0.50, -3.65),                                 # borda enrolada
    (0.38, -2.90), (0.32, -2.00), (0.28, -1.00), (0.25, -0.20),                                 # parede de dentro
]


def direcao(ang_graus):
    """Vetor do dedo no plano da palma: 0 é +Y, positivo abre para +X."""
    a = math.radians(ang_graus)
    return (math.sin(a), math.cos(a), 0.0)

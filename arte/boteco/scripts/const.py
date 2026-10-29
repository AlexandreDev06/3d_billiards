"""Medidas fixas do boteco (as do jogo, em metros) e pequenos auxiliares; usadas por `cena.py` e `aderecos.py`."""
import math

# medidas da mesa (packages/fisica/src/medidas.ts, MESA_BAR): só leitura, aqui só para a folga. O jogo desenha a tabela (0,04) e a moldura (0,08)
# por fora da área de jogo de 2,1 x 1,2; a folga de 1,6 m conta da borda de fora da moldura.
MESA_COMPRIMENTO, MESA_LARGURA, MESA_TABELA, MESA_MOLDURA = 2.1, 1.2, 0.04, 0.08
FOLGA = 1.6
SEMI_X = MESA_COMPRIMENTO / 2 + MESA_TABELA + MESA_MOLDURA   # 1,17
SEMI_Z = MESA_LARGURA / 2 + MESA_TABELA + MESA_MOLDURA       # 0,72

PISO, TETO = -0.8, 2.6
X0, X1, Z0, Z1 = -5.0, 5.0, -3.2, 3.2
H_AZULEJO = PISO + 1.35
H_BARRADO = H_AZULEJO + 0.15
JANELA = dict(x0=-1.7, x1=0.5, y0=0.25, y1=1.75, prof=0.25)
LUMINARIA_Y = 0.9  # altura da luminária acima do pano (config.luz.luminaria.altura do jogo)
BALCAO = dict(x0=-3.85, x1=-3.3, z0=-3.2, z1=0.9, alt=1.1)
TOPO_BALCAO = PISO + BALCAO["alt"]   # y do tampo do balcão
VENT = dict(x=-1.6, z=1.9)


def sg(c, baixo, medio, alto):
    """Valor por nível de detalhe (0 baixo, 1 médio, 2 alto)."""
    return (baixo, medio, alto)[c.lod]


def uv_cel(col, row, ncols, nrows):
    """Retângulo (u0, u1, v0, v1) de uma célula num atlas (linha 0 em cima)."""
    return col / ncols, (col + 1) / ncols, 1 - (row + 1) / nrows, 1 - row / nrows


def quad_parede(c, m, lado, s, y, w, h, uv=None, e=0.012):
    """Retângulo w x h colado numa parede, olhando para dentro da sala: `lado` z-, z+, x- ou x+; `s` = posição ao longo da parede (x ou z), `y` = centro."""
    u0, u1, v0, v1 = uv if uv else (0.0, 1.0, 0.0, 1.0)
    from geom import I4, quad
    if lado == "z-":
        pts = [(s - w / 2, y - h / 2, Z0 + e), (s + w / 2, y - h / 2, Z0 + e), (s + w / 2, y + h / 2, Z0 + e), (s - w / 2, y + h / 2, Z0 + e)]
    elif lado == "z+":
        pts = [(s + w / 2, y - h / 2, Z1 - e), (s - w / 2, y - h / 2, Z1 - e), (s - w / 2, y + h / 2, Z1 - e), (s + w / 2, y + h / 2, Z1 - e)]
    elif lado == "x-":
        pts = [(X0 + e, y - h / 2, s + w / 2), (X0 + e, y - h / 2, s - w / 2), (X0 + e, y + h / 2, s - w / 2), (X0 + e, y + h / 2, s + w / 2)]
    else:
        pts = [(X1 - e, y - h / 2, s - w / 2), (X1 - e, y - h / 2, s + w / 2), (X1 - e, y + h / 2, s + w / 2), (X1 - e, y + h / 2, s - w / 2)]
    quad(m, I4, *pts, (u0, v0), (u1, v0), (u1, v1), (u0, v1))

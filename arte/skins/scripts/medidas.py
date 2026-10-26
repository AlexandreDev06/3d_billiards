"""As medidas do taco, copiadas de `apps/web/src/cena/perfil-do-taco.ts` e `packages/fisica/src/medidas.ts` (TACO).

Tudo em metros, `q` = distância da ponta ao longo do taco. O UV de cada peça (`cena/torneado.ts`): u dá a volta (0 a 1,
no sentido de y para z em volta do eixo -X) e v corre da ponta (0) ao cabo (1), proporcional ao comprimento.
Rode `python3 medidas.py` para ver a tabela (não precisa do Blender).
"""
import math

COMPRIMENTO = 1.45
RAIO_PONTA = 0.006
RAIO_BASE = 0.015

PECAS = ("sola", "virola", "haste", "junta", "antebraco", "punho", "anel", "base", "borracha")

_ALTURA_SOLA = 0.75 * RAIO_PONTA
_FIM = {
    "sola": _ALTURA_SOLA,
    "virola": _ALTURA_SOLA + 4.5 * RAIO_PONTA,
    "haste": 0.5 * COMPRIMENTO,
    "junta": 0.511 * COMPRIMENTO,
    "antebraco": 0.69 * COMPRIMENTO,
    "punho": 0.862 * COMPRIMENTO,
    "anel": 0.87 * COMPRIMENTO,
    "base": 0.985 * COMPRIMENTO,
    "borracha": COMPRIMENTO,
}


def cone(q):
    """Raio do cone liso de ponta a ponta."""
    return RAIO_PONTA + (RAIO_BASE - RAIO_PONTA) * q / COMPRIMENTO


def de(peca):
    i = PECAS.index(peca)
    return 0.0 if i == 0 else _FIM[PECAS[i - 1]]


def ate(peca):
    return _FIM[peca]


def _hump(u):
    return math.sin(math.pi * min(max(u, 0.0), 1.0))


def raio(peca, q):
    """O raio da peça a `q` m da ponta (a folga de desenho de cada uma inclusa)."""
    u = (q - de(peca)) / (ate(peca) - de(peca)) if ate(peca) > de(peca) else 0.0
    if peca == "haste":
        return cone(q) * 0.997
    if peca == "junta":
        return cone(q) * (1 + 0.035 * min(1.0, 4 * _hump(u)))
    if peca == "punho":
        return cone(q) * (1 + 0.012 * _hump(u))
    if peca == "anel":
        return cone(q) * (1 + 0.04 * min(1.0, 4 * _hump(u)))
    if peca == "borracha":
        t = u
        arred = math.sqrt(max(1 - ((t - 0.7) / 0.3) ** 2, 0.0)) if t > 0.7 else 1.0
        return cone(q) * 0.975 * arred
    if peca == "sola":
        h = _ALTURA_SOLA
        rs = 0.98 * RAIO_PONTA
        curv = (rs ** 2 + h ** 2) / (2 * h)
        return math.sqrt(max(2 * curv * q - q * q, 0.0))
    return cone(q)


def circunferencia(peca, q):
    return 2 * math.pi * raio(peca, q)


def medidas_da_peca(peca):
    """Comprimento e circunferência média (mm) como `proporcaoDaParte` do web: raio médio entre as pontas da peça."""
    d, a = de(peca), ate(peca)
    r_medio = (raio(peca, d) + raio(peca, a)) / 2
    return {
        "de_m": d,
        "ate_m": a,
        "comprimento_mm": (a - d) * 1000,
        "circunferencia_mm": 2 * math.pi * r_medio * 1000,
        "raio_ponta_mm": raio(peca, d) * 1000,
        "raio_cabo_mm": raio(peca, a) * 1000,
    }


# Densidade de pixels por mm: a peça longa (haste) bate nos 2048 px; as curtas ganham mais (até 8 px/mm), para a arte ler de perto.
PPM_MAXIMO = 8.0
LADO_MAXIMO = 2048


def tamanho_em_pixels(peca):
    m = medidas_da_peca(peca)
    ppm = min(PPM_MAXIMO, LADO_MAXIMO / max(m["comprimento_mm"], m["circunferencia_mm"]))
    largura = int(round(m["circunferencia_mm"] * ppm / 2)) * 2
    altura = int(round(m["comprimento_mm"] * ppm / 2)) * 2
    return largura, altura, ppm


if __name__ == "__main__":
    for p in ("haste", "antebraco", "punho", "base"):
        m = medidas_da_peca(p)
        w, h, ppm = tamanho_em_pixels(p)
        print(f"{p:10s} q {m['de_m']:.4f}→{m['ate_m']:.4f}  {m['comprimento_mm']:.1f} × {m['circunferencia_mm']:.1f} mm  "
              f"raio {m['raio_ponta_mm']:.2f}→{m['raio_cabo_mm']:.2f}  PNG {w}×{h}  ({ppm:.2f} px/mm)")

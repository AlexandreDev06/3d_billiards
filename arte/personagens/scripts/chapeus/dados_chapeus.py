"""Os dados dos chapéus (P8): ids do contrato, níveis de detalhe e a calota do balão, de onde cada chapéu tira o seu assento.

Unidades em centímetros. O chapéu fica no sistema da `ancora_chapeu`: a origem é o alto da cabeça (z = 6,6 cm no balão), +Z sobe, a frente é -Y (o exportador vira para Y-up).
"""
import os
import sys

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
BALAO = os.path.abspath(os.path.join(PASTA, "..", "balao"))
if BALAO not in sys.path:
    sys.path.insert(0, BALAO)
import dados as DB                      # os dados do balão (medidas do corpo)
import geometria as GB                  # raio_do_corpo(z)

IDS = ["chapeu_panama", "bone_aba_reta", "cartola", "gorro_pompom", "chapeu_palha", "boina", "chapeu_festa", "coroa"]
TOPO = DB.METADE_ALTURA                 # o alto do balão, em cm, no sistema do corpo
FOLGA = 0.05                            # o chapéu fica a este tanto (cm) da pele, para não brigar com ela
SOBRANCELHA_MAX_Z = 4.95                # a sobrancelha mais alta (cara_convencido com olho_kawaii): nenhum chapéu desce abaixo disto em nenhuma vista
LOD = {
    "alta": dict(nome="alta", n=48, fino=1.0),
    "baixa": dict(nome="baixa", n=16, fino=0.0),
}


def raio_da_calota(z_local):
    """O raio do corpo na altura `z_local` (cm, 0 = alto da cabeça; negativo desce); zero acima do topo."""
    z = TOPO + z_local
    if z >= TOPO:
        return 0.0
    return float(GB.raio_do_corpo(z))


def profundidade_do_raio(r):
    """Quanto (cm, positivo) abaixo do topo o corpo tem raio `r`: onde uma borda de raio interno `r` assenta."""
    lo, hi = 0.0, 3.5
    for _ in range(50):
        mid = 0.5 * (lo + hi)
        if raio_da_calota(-mid) < r:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)

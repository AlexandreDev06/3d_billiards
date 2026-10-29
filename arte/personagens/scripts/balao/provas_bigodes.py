"""Provas dos bigodes por script (P8): o bigode fica colado sobre o lábio de cima, sem descer à boca, sem entrar no olho e sem flutuar, em toda cara e nos dois níveis.

Contas (em `bigodes.py`, sem rasterizar), por bigode, nível e cara (as 17 formas do v2; as formas que só mexem nos olhos não mexem no bigode):
  - folga sobre o lábio: o menor `z - borda_do_labio(x)` das fitas dentro da largura da boca (e, a meio de cada segmento, a corda da malha baixa);
  - folga do olho: a menor distância de um ponto do bigode ao centro de cada olho, contra o fundo da pálpebra de baixo (1,23 cm) e a sobrancelha (1,26);
  - elevação: o quanto o bigode fica acima da pele (nunca abaixo; o máximo na borda de baixo, que é o que se vê como "flutuar").
Rasterizada (nível alto, câmeras de frente, de cima e de lado), com e sem o bigode, nas caras, nos meios-pesos (cara x 0,5, como a mistura do jogo), no piscar,
nas pálpebras de olhar para baixo/cima e nos três estilos de olho com forma:
  - o interior da boca, os dentes e a língua visíveis com o bigode / sem o bigode (razão);
  - a região do olho (globo, pálpebras, fitas, brilhos, olheiras, sobrancelhas) com e sem: tem de ser 1,000;
  - o quanto do bigode aparece, contra o bigode sozinho (a pele ou o lábio não o cobrem: razão perto de 1).

Uso: blender -b --factory-startup --python arte/personagens/scripts/balao/provas_bigodes.py -- [saida.txt] [--rapido] [--so-contas]
"""
import itertools
import math
import os
import sys

import numpy as np

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import bigodes as B
import dados as D
import geometria as G
import provas_olhos as PO
import raster as RS

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SAIDA = next((a for a in ARGV if not a.startswith("--")), None)
RAPIDO = "--rapido" in ARGV
LINHAS = []
FUNDO_DA_PALPEBRA = 1.23
POUSO_DA_SOBRANCELHA = 1.26
LIMITE_DO_OLHO = 1.25          # cm: o bigode nunca chega mais perto que isto do centro de um olho (o círculo proibido é 1,30; o fundo da pálpebra de baixo, 1,23)
MAT_BIGODE = 50


def dizer(t=""):
    print(t)
    LINHAS.append(t)


def caras():
    return [n for n in D.FORMAS if n.startswith("cara_")]


def contas(lod):
    """Por bigode e cara: (folga sobre o lábio, folga da corda, folga do olho, elevação mínima, elevação máxima da borda de baixo, pontas fora da boca)."""
    saida = {}
    avisos = []
    for i in D.IDS_DE_BIGODE:
        for c in caras():
            b = G.estado_da_cara(c)["boca"]
            borda = B.borda_do_labio(b)
            x0, meia, _, _ = B.funcoes_da_boca(b)
            sobra = lod["sobra"] * B.SOBRA_BIGODE
            folga_labio, folga_corda, folga_olho, emin, emax_pe, fora = 9.0, 9.0, 9.0, 9.0, 0.0, 9.0
            for f in B.DESENHOS[i](b, lod):
                K, V, _ = f.xz.shape
                for k in range(K):
                    for j in range(V):
                        x, z = f.xz[k, j]
                        e = sobra + f.elev[k, j]
                        emin = min(emin, e)
                        for lado in (+1, -1):
                            folga_olho = min(folga_olho, math.hypot(x - lado * D.OLHO_X, z - D.OLHO_Z))
                        if abs(x - x0) <= meia:
                            folga_labio = min(folga_labio, z - borda(x))
                            if j == 0:
                                emax_pe = max(emax_pe, e)
                        else:
                            fora = min(fora, z - borda(x))
                        if k + 1 < K and abs(x - x0) <= meia:
                            xm = (x + f.xz[k + 1, j, 0]) / 2
                            zm = (z + f.xz[k + 1, j, 1]) / 2
                            if abs(xm - x0) <= meia:
                                folga_corda = min(folga_corda, zm - borda(xm))
            saida[(i, c)] = (folga_labio, folga_corda, folga_olho, emin, emax_pe, fora)
            if folga_olho < LIMITE_DO_OLHO:
                avisos.append("%s %s %s: ponto a %.3f cm do centro do olho" % (lod["nome"], i, c, folga_olho))
    return saida, avisos


class FormasDoBigode:
    """As posições do bigode numa combinação de pesos, como o jogo as faz: base + soma dos pesos x (forma - base)."""

    def __init__(self, lod, id_):
        base = B.gerar_bigode(lod, G.estado_da_cara(D.NOME_DA_BASE), id_)
        self.m = base
        self.V0 = np.array(base.V)
        self.delta = {}
        for c in caras():
            if c == D.NOME_DA_BASE:
                continue
            self.delta[c] = np.array(B.gerar_bigode(lod, G.estado_da_cara(c), id_).V) - self.V0

    def posicoes(self, pesos):
        v = self.V0.copy()
        for nome, w in pesos.items():
            if nome in self.delta and w:
                v += w * self.delta[nome]
        return v


class Cena:
    """O corpo (só o que está na frente do rosto) e, se pedido, o bigode, num objeto que o rasterizador entende."""

    def __init__(self, base, V_corpo, bigode=None, V_bigode=None, so_bigode=False):
        self.partes = {}
        nomes = list(base.partes)
        frente = (V_corpo[:, 1] < 1.5) & (V_corpo[:, 2] > -7.0) & (V_corpo[:, 2] < 8.0)
        F, M = [], []
        if not so_bigode:
            for f, mt in zip(base.F, base.M):
                if all(frente[i] for i in f):
                    F.append(f)
                    M.append(mt)
        n0 = len(V_corpo)
        self.V = V_corpo
        if bigode is not None:
            self.V = np.vstack([V_corpo, V_bigode])
            for f, mt in zip(bigode.F, bigode.M):
                F.append(tuple(i + n0 for i in f))
                M.append(MAT_BIGODE)
        self.F, self.M = F, M
        self.UV = None
        for nome in nomes:
            self.partes[nome] = tuple(base.partes[nome])
        self.partes["bigode"] = (n0, len(self.V))


def camera(el, az, alvo=(0.0, -4.0, 0.3), dist=24.0, fov=24.0):
    d = np.array([math.sin(math.radians(az)) * math.cos(math.radians(el)), -math.cos(math.radians(az)) * math.cos(math.radians(el)), math.sin(math.radians(el))])
    return (tuple(np.array(alvo) + dist * d), tuple(alvo), fov)


def raster():
    formas = PO.Formas(G.ALTA)
    base = formas.base
    _, nomes = RS.parte_de_cada_vertice(base)
    nomes = nomes + ["bigode"]
    por_prefixo = lambda *p: [i for i, n in enumerate(nomes) if n.startswith(p)]
    boca = por_prefixo("boca")
    olho = por_prefixo("globo_", "palpebra_", "sobrancelha_", "fita_", "brilhos_")
    olheira = por_prefixo("olheira_")
    bochecha = por_prefixo("bochecha_")
    mat_boca = (3, 7, 8)
    cams = [((0, 0), camera(0, 0)), ((21, 0), camera(21, 0)), ((0, 30), camera(0, 30))]
    if not RAPIDO:
        cams.append(((-12, 0), camera(-12, 0)))
    cenarios = []
    for c in caras():
        cenarios.append((c, {c: 1.0}))
        cenarios.append((c + " x0,5", {c: 0.5}))
    esc = D.abertura_da_cara(D.NOME_DA_BASE)
    for c in ("cara_neutro", "cara_rindo", "cara_susto", "cara_bravo"):
        if c not in D.FORMAS:
            continue
        for extra in ({"piscar": 1.0}, {"palpebra_baixo": 1.0}, {"palpebra_cima": 1.0}, {"estilo_kawaii": 1.0}, {"estilo_bravo": 1.0}, {"estilo_cansado": 1.0}):
            cenarios.append(("%s + %s" % (c, "+".join(extra)), {c: 1.0, **extra}))
    bigs = {}
    for i in D.IDS_DE_BIGODE:
        bigs[i] = FormasDoBigode(G.ALTA, i)
    dizer("== com o bigode / sem o bigode, nível alto, %d cenários x %d câmeras (menor razão por bigode) ==" % (len(cenarios), len(cams)))
    dizer("olho = globo, pálpebras, fita, brilhos e sobrancelhas (tem de ser 1,000); boca = interior, dentes e língua; olheira e bochecha: o que o bigode cobre delas; visível = o bigode que aparece, contra o bigode sozinho")
    dizer("%-15s %6s %-30s %6s %-30s %6s %-30s %6s %-30s %6s" % ("bigode", "olho", "pior cenário", "boca", "pior cenário", "visível", "pior cenário", "olheira", "pior cenário", "bochecha"))
    pior = {i: dict(olho=(2.0, ""), boca=(2.0, ""), vis=(2.0, ""), olheira=(2.0, ""), bochecha=(2.0, "")) for i in D.IDS_DE_BIGODE}
    for rot, pesos in cenarios:
        V = formas.posicoes(pesos)
        sem = Cena(base, V)
        for (el, az), cam in cams:
            mid0, pid0 = RS.ids(sem, cam, (180, 135), V=sem.V)
            olho0 = int(np.isin(pid0, olho).sum())
            boca0 = int((np.isin(pid0, boca) & np.isin(mid0, mat_boca)).sum())
            olheira0 = int(np.isin(pid0, olheira).sum())
            bochecha0 = int(np.isin(pid0, bochecha).sum())
            for i, fb in bigs.items():
                Vb = fb.posicoes(pesos)
                com = Cena(base, V, fb.m, Vb)
                mid1, pid1 = RS.ids(com, cam, (180, 135), V=com.V)
                so = Cena(base, V, fb.m, Vb, so_bigode=True)
                mid2, _ = RS.ids(so, cam, (180, 135), V=so.V)
                onde = "%s el=%d az=%d" % (rot, el, az)
                o1 = int(np.isin(pid1, olho).sum())
                b1 = int((np.isin(pid1, boca) & np.isin(mid1, mat_boca)).sum())
                vis = int((mid1 == MAT_BIGODE).sum())
                tot = int((mid2 == MAT_BIGODE).sum())
                oh1, bo1 = int(np.isin(pid1, olheira).sum()), int(np.isin(pid1, bochecha).sum())
                for chave, razao in (("olho", o1 / max(olho0, 1)), ("boca", b1 / boca0 if boca0 else 2.0), ("vis", vis / tot if tot else 2.0),
                                     ("olheira", oh1 / olheira0 if olheira0 else 2.0), ("bochecha", bo1 / bochecha0 if bochecha0 else 2.0)):
                    if razao < pior[i][chave][0]:
                        pior[i][chave] = (razao, onde)
    for i in D.IDS_DE_BIGODE:
        p = pior[i]
        dizer("%-15s %6.3f %-30s %6.3f %-30s %6.3f %-30s %6.3f %-30s %6.3f" % (i, p["olho"][0], p["olho"][1], p["boca"][0], p["boca"][1], p["vis"][0], p["vis"][1], p["olheira"][0], p["olheira"][1], p["bochecha"][0]))


def main():
    for lod in (G.ALTA, G.BAIXA):
        r, avisos = contas(lod)
        dizer("== %s: folgas em cm (menor entre as %d caras) ==" % (lod["nome"], len(caras())))
        dizer("%-16s %12s %12s %12s %12s %12s %12s" % ("bigode", "sobre_lábio", "corda", "do_olho", "elev_mín", "elev_pé_máx", "ponta_fora"))
        for i in D.IDS_DE_BIGODE:
            linha = [min(r[(i, c)][k] for c in caras()) for k in range(6)]
            linha[4] = max(r[(i, c)][4] for c in caras())
            dizer("%-16s %12.3f %12.3f %12.3f %12.3f %12.3f %12.3f" % ((i,) + tuple(linha)))
        dizer("limites: sobre_lábio e corda >= 0; do_olho >= %.2f (o círculo proibido é %.2f; o fundo da pálpebra de baixo, %.2f, e o pouso da sobrancelha, %.2f); elev_mín > 0" % (LIMITE_DO_OLHO, B.RAIO_PROIBIDO, FUNDO_DA_PALPEBRA, POUSO_DA_SOBRANCELHA))
        dizer("pontas à vista: ponta_fora = a ponta de guidão e de Dalí e as pontas do bigodão, fora da largura da boca, ficam até esse tanto abaixo do contorno do lábio estendido (negativo = abaixo; é o desenho: o bigodão cai ao lado do canto)")
        for a in avisos:
            dizer("  aviso: " + a)
        if not avisos:
            dizer("sem aviso: em nenhuma das %d caras e dos 5 bigodes um ponto chega a menos de %.2f cm do centro do olho" % (len(caras()), LIMITE_DO_OLHO))
        dizer()
    if "--so-contas" not in ARGV:
        raster()
    if SAIDA:
        open(SAIDA, "w").write("\n".join(LINHAS) + "\n")


main()

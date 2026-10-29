"""Provas do olho por script (sem abrir imagem): a pálpebra encosta no globo (sem fresta e sem afundar), nenhuma mancha de látex dentro da abertura,
os cantos fecham, a sobrancelha pousa na pálpebra e a íris aparece inteira até o limite do olhar.

Uso: blender -b --factory-startup --python arte/personagens/scripts/balao/provas_olhos.py -- [saida.txt] [rapido]
As formas são combinadas como o jogo faz (cara x (1 - piscar) + piscar, mais `palpebra_cima`/`palpebra_baixo` pelo olhar vertical).
"""
import math
import os
import sys

import numpy as np

PASTA = os.path.dirname(os.path.abspath(globals().get("__file__", "")))
if PASTA not in sys.path:
    sys.path.insert(0, PASTA)
import dados as D
import geometria as G
import raster as RS

R = D.OLHO_RAIO


class Formas:
    """As posições de todas as formas de um nível: `posicoes(pesos)` = base + soma dos pesos x (forma - base)."""

    def __init__(self, lod):
        self.lod = lod
        self.base = G.gerar(lod, G.estado_da_cara(D.NOME_DA_BASE))
        self.V0 = np.array(self.base.V)
        self.delta = {}
        self.afunda = {}                       # por forma: quanto o globo afunda a mais que no neutro, (esq, dir)
        base_af = self._afundas(G.estado_da_cara(D.NOME_DA_BASE))
        for nome in D.FORMAS:
            if nome == D.NOME_DA_BASE:
                continue
            est = G.estado_da_cara(nome)
            self.delta[nome] = np.array(G.gerar(lod, est, com_faces=False).V) - self.V0
            self.afunda[nome] = tuple(a - b for a, b in zip(self._afundas(est), base_af))
        self.afunda_base = base_af

    @staticmethod
    def _afundas(est):
        return (G.afunda_do_olho(est["esq"]), G.afunda_do_olho(est["dir"]))

    def afunda_total(self, pesos):
        """O quanto o globo de cada olho (esq, dir) afundou na pele nesta combinação de pesos (as formas se somam)."""
        e, d = self.afunda_base
        for nome, w in pesos.items():
            if nome in self.afunda and w:
                e += w * self.afunda[nome][0]
                d += w * self.afunda[nome][1]
        return {+1: e, -1: d}

    def posicoes(self, pesos):
        v = self.V0.copy()
        for nome, w in pesos.items():
            if nome in self.delta and w:
                v += w * self.delta[nome]
        return v


def cenarios_do_jogo(piscar=(0.0, 1.0)):
    """(rótulo, pesos): cada cara sozinha, com piscar (a cara vezes 1 - piscar) e com as pálpebras seguindo o olhar (pela abertura da cara)."""
    caras = [n for n in D.FORMAS if n.startswith("cara_")]
    out = []
    for c in caras:
        for p in piscar:
            out.append(("%s piscar=%.1f" % (c, p), {c: 1 - p, "piscar": p}))
        esc = D.abertura_da_cara(c)
        for forma in ("palpebra_cima", "palpebra_baixo"):
            for w in (0.5, 1.0):
                out.append(("%s %s=%.1f(x%.2f)" % (c, forma, w, esc), {c: 1.0, forma: w * esc}))
    return out


def fora_do_corpo(v, folga=0.02):
    """Os pontos que não estão dentro do corpo (os escondidos pela pele não contam)."""
    r = np.hypot(v[:, 0], v[:, 1])
    rc = np.array([G.raio_do_corpo(z) for z in v[:, 2]])
    return r > rc + folga


def cenarios_de_piscadinha():
    """Cada cara somada a uma piscada de um olho só (a forma `piscar_esq`/`piscar_dir` por cima da cara, sem multiplicá-la)."""
    return [("%s %s=1" % (c, lado), {c: 1.0, lado: 1.0}) for c in D.FORMAS if c.startswith("cara_") for lado in ("piscar_esq", "piscar_dir")]


def peso_da_cara_na_piscadinha(formas, cara, tol_fresta=0.07, tol_afunda=-0.08):
    """O maior peso da cara (0 a 1) que, somada a uma piscadinha, ainda não deixa fresta nem afunda a pálpebra."""
    for k in (1.0, 0.8, 0.6, 0.45, 0.3, 0.15, 0.0):
        fre, _, afu, _ = folga_das_palpebras(formas, [("x", {cara: k, "piscar_esq": 1.0}), ("x", {cara: k, "piscar_dir": 1.0})])
        if fre <= tol_fresta and afu >= tol_afunda:
            return k
    return 0.0


def abertura_segura(formas, cara, tol_fresta=0.07, tol_afunda=-0.08):
    """O maior multiplicador (passo de 0,05) de `palpebra_cima` e `palpebra_baixo` que a cara aguenta sem fresta nem afundar: o teto de `dados.ABERTURA_SEGURA`."""
    for i in range(21):
        k = round(1.0 - 0.05 * i, 2)
        fre, _, afu, _ = folga_das_palpebras(formas, [("x", {cara: 1.0, f: k}) for f in ("palpebra_cima", "palpebra_baixo")])
        if fre <= tol_fresta and afu >= tol_afunda:
            return k
    return 0.0


def folga_das_palpebras(formas, cenarios):
    """Para cada pálpebra: a distância da borda ao globo (>= 0 sem afundar; <= 0,03 sem fresta) e o quanto a casca afunda no globo onde se vê."""
    lod = formas.lod
    base = formas.base
    n_col = 2 * lod["lid_J"] + 1
    pior_fresta, pior_afunda, pior_afunda_cena, pior_fresta_cena = -9.0, 9.0, "", ""
    for rotulo, pesos in cenarios:
        V = formas.posicoes(pesos)
        af = formas.afunda_total(pesos)
        ligadas = tuple(ch for ch in D.CHAVES_DA_PALPEBRA_DE_ESTILO if pesos.get("estilo_" + ch[len("est_"):], 0) >= 0.99)     # a do estilo só conta onde está à mostra
        for lado, nome in ((+1, "esq"), (-1, "dir")):
            c = G.centro_do_olho(lado, af[lado])
            for chave in ("sup", "inf") + ligadas:
                a, b = base.partes["palpebra_%s_%s" % (chave, nome)]
                pts = V[a:b]
                d = np.linalg.norm(pts - c, axis=1) - R
                visivel = fora_do_corpo(pts)
                borda = pts[-n_col:]
                dborda = np.linalg.norm(borda - c, axis=1) - R
                psis = np.array([-D.PALPEBRA_PSI + 2 * D.PALPEBRA_PSI * j / (n_col - 1) for j in range(n_col)])
                ok = (np.abs(psis) < 80) & fora_do_corpo(borda)
                if ok.any() and dborda[ok].max() > pior_fresta:
                    pior_fresta, pior_fresta_cena = float(dborda[ok].max()), "%s %s %s" % (rotulo, chave, nome)
                if visivel.any() and d[visivel].min() < pior_afunda:
                    pior_afunda, pior_afunda_cena = float(d[visivel].min()), "%s %s %s" % (rotulo, chave, nome)
    return pior_fresta, pior_fresta_cena, pior_afunda, pior_afunda_cena


def cantos(formas, cenarios):
    """A distância entre a borda de cima e a de baixo nos dois cantos (psi = +-90): as pálpebras se encontram na lateral do globo."""
    lod = formas.lod
    n_col = 2 * lod["lid_J"] + 1
    meio_esq = [j for j in range(n_col) if abs(abs(-D.PALPEBRA_PSI + 2 * D.PALPEBRA_PSI * j / (n_col - 1)) - 90.0) < 0.01]
    pior = 0.0
    onde = ""
    for rotulo, pesos in cenarios:
        V = formas.posicoes(pesos)
        for nome in ("esq", "dir"):
            a, _ = formas.base.partes["palpebra_sup_" + nome]
            a2, _ = formas.base.partes["palpebra_inf_" + nome]
            fa = V[formas.base.partes["palpebra_sup_" + nome][1] - n_col:formas.base.partes["palpebra_sup_" + nome][1]]
            fb = V[formas.base.partes["palpebra_inf_" + nome][1] - n_col:formas.base.partes["palpebra_inf_" + nome][1]]
            for j in meio_esq:
                dist = float(np.linalg.norm(fa[j] - fb[j]))
                if dist > pior:
                    pior, onde = dist, "%s %s psi=%s" % (rotulo, nome, "+90" if j > n_col // 2 else "-90")
    return pior, onde


def manchas(formas, cenarios, camera, tam=(150, 100)):
    """Conta pixels de látex (ou de preto que não é do globo) cercados de olho nos quatro lados: manchas sobre o olho `esq`."""
    m = formas.base
    total = 0
    detalhes = []
    _, nomes = RS.parte_de_cada_vertice(m)
    globo = nomes.index("globo_esq")
    for rotulo, pesos in cenarios:
        V = formas.posicoes(pesos)
        mid, pid = RS.ids(m, camera, tam, V=V)
        G_ = (np.isin(mid, (1, 9, 5))) | ((mid == 2) & (pid == globo))
        esq = np.maximum.accumulate(G_, axis=1)
        dire = np.maximum.accumulate(G_[:, ::-1], axis=1)[:, ::-1]
        cima = np.maximum.accumulate(G_, axis=0)
        baixo = np.maximum.accumulate(G_[::-1, :], axis=0)[::-1, :]
        do_outro_olho = np.isin(pid, [i for i, n in enumerate(nomes) if n.endswith("_dir")])     # o olho vizinho, que entra na foto de 3/4, não é mancha
        cand = ~G_ & ~do_outro_olho & ((mid == 0) | (mid == 2)) & esq & dire & cima & baixo
        n_cena = int(cand.sum())
        if n_cena:
            detalhes.append((rotulo, n_cena))
        total += n_cena
    return total, detalhes


def iris_visivel(formas, graus_lista, limite, extra=None):
    """Giro o globo por `g` graus em cada direção (com as pálpebras seguindo na vertical) e vejo, de frente, a fração da íris (e da pupila) que ainda aparece."""
    lod = formas.lod
    m = formas.base
    resultados = []
    base_v = formas.V0
    for lado, nome in ((+1, "esq"),):
        c = G.centro_do_olho(lado)
        a, b = m.partes["globo_" + nome]
        camera = ((c[0], -30.0, c[2]), (c[0], -4.0, c[2]), 8.0)
        for g in graus_lista:
            for direcao, (yaw, pit) in {"esquerda": (g, 0), "direita": (-g, 0), "cima": (0, g), "baixo": (0, -g),
                                        "cima-esq": (g * 0.7, g * 0.7), "baixo-dir": (-g * 0.7, -g * 0.7)}.items():
                pesos = {"cara_neutro": 1.0, **(extra or {})}
                if pit > 0:
                    pesos["palpebra_cima"] = min(pit / limite, 1.0)
                elif pit < 0:
                    pesos["palpebra_baixo"] = min(-pit / limite, 1.0)
                V = formas.posicoes(pesos)
                # gira o globo em volta do centro (guinada em Z, depois arfada em X)
                gi = V[a:b] - c
                cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
                gi = np.stack([gi[:, 0] * cy - gi[:, 1] * sy, gi[:, 0] * sy + gi[:, 1] * cy, gi[:, 2]], axis=1)
                cp, sp = math.cos(math.radians(pit)), math.sin(math.radians(pit))
                gi = np.stack([gi[:, 0], gi[:, 1] * cp + gi[:, 2] * sp, -gi[:, 1] * sp + gi[:, 2] * cp], axis=1)
                V[a:b] = gi + c
                mid, _ = RS.ids(m, camera, (160, 160), V=V)
                # o que apareceria se nada tapasse: só o globo
                so = RS.Subconjunto(m, [nome_p for nome_p in m.partes if nome_p == "globo_" + nome])
                mid0, _ = RS.ids(so, camera, (160, 160), V=V)
                i_todo, i_vis = int(np.sum(mid0 == 9)), int(np.sum((mid0 == 9) & ((mid == 9) | (mid == 5))))   # o reflexo sobre a íris conta como íris visível
                resultados.append((direcao, g, i_vis / max(i_todo, 1)))
    return resultados


def olho_fechado(formas, giros=(0.0, 20.0, 34.0), extra=None):
    """No olho fechado (rindo, comemorando, piscar e as piscadinhas): o globo, os reflexos e as pálpebras ficam por baixo da pele (mesmo com o olho girado até o limite do olhar)
    e a fita do "^ ^" está sobre a pele; no olho aberto a fita está por baixo. Devolve (maior saliência de globo/pálpebra em cm, menor altura da fita fechada, maior altura da fita aberta)."""
    m = formas.base
    saliencia, fita_min, fita_aberta = -9.0, 9.0, -9.0
    onde = ""
    fechados = [{"cara_rindo": 1.0}, {"cara_comemorando": 1.0}, {"piscar": 1.0}]
    fechados += [{c_: 1.0, lado: 1.0} for c_ in D.FORMAS if c_.startswith("cara_") for lado in ("piscar_esq", "piscar_dir")]
    abertos = [{c_: 1.0} for c_ in D.FORMAS if c_.startswith("cara_") and c_ not in ("cara_rindo", "cara_comemorando")]
    r_pele = lambda v: np.hypot(v[:, 0], v[:, 1]) - np.array([G.raio_do_corpo(z) for z in v[:, 2]])
    fechados = [{**p_, **(extra or {})} for p_ in fechados]
    abertos = [{**p_, **(extra or {})} for p_ in abertos]
    for pesos in fechados:
        V = formas.posicoes(pesos)
        af = formas.afunda_total(pesos)
        for lado, nome in ((+1, "esq"), (-1, "dir")):
            if af[lado] < 0.5 * D.SINK_FECHADO:
                continue
            c = G.centro_do_olho(lado)                    # o osso do olho gira em volta do centro de repouso
            a, b = m.partes["globo_" + nome]
            for yaw, pit in [(g * k, 0) for g in giros for k in (-1, 1)] + [(0, g * k) for g in giros for k in (-1, 1)]:
                gi = V[a:b] - c
                cy, sy = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
                gi = np.stack([gi[:, 0] * cy - gi[:, 1] * sy, gi[:, 0] * sy + gi[:, 1] * cy, gi[:, 2]], axis=1)
                cp, sp = math.cos(math.radians(pit)), math.sin(math.radians(pit))
                gi = np.stack([gi[:, 0], gi[:, 1] * cp + gi[:, 2] * sp, -gi[:, 1] * sp + gi[:, 2] * cp], axis=1)
                v_ = float(r_pele(gi + c).max())
                if v_ > saliencia:
                    saliencia, onde = v_, "globo %s %s giro %s" % (pesos, nome, (yaw, pit))
            for parte in ["brilhos_" + nome, "palpebra_sup_" + nome, "palpebra_inf_" + nome] + ["palpebra_%s_%s" % (ch, nome) for ch in D.CHAVES_DA_PALPEBRA_DE_ESTILO]:
                a2, b2 = m.partes[parte]
                v_ = float(r_pele(V[a2:b2]).max())
                if v_ > saliencia:
                    saliencia, onde = v_, "%s %s" % (parte, pesos)
            a3, b3 = m.partes["fita_" + nome]
            fita_min = min(fita_min, float(r_pele(V[a3:b3]).min()))
    for pesos in abertos:
        V = formas.posicoes(pesos)
        for nome in ("esq", "dir"):
            a3, b3 = m.partes["fita_" + nome]
            fita_aberta = max(fita_aberta, float(r_pele(V[a3:b3]).max()))
    return saliencia, fita_min, fita_aberta, onde


def medir(formas, lod, extra, rotulo, rapido, dizer):
    """As provas do olho com `extra` somado a cada cenário (os pesos de uma forma de estilo; `{}` é o olho normal). Devolve um resumo para o meta."""
    cen = [(r + (" +" + "+".join(extra) if extra else ""), {**p_, **extra}) for r, p_ in cenarios_do_jogo()]
    pisc = [(r + (" +" + "+".join(extra) if extra else ""), {**p_, **extra}) for r, p_ in cenarios_de_piscadinha()]
    if rapido:
        cen = cen[::5]
    dizer("-- %s --" % rotulo)
    fre, fre_c, afu, afu_c = folga_das_palpebras(formas, cen + pisc)
    dizer("fresta máxima da borda ao globo: %.3f cm (%s)   [precisa <= 0,07]" % (fre, fre_c))
    dizer("pálpebra mais afundada no globo (onde se vê): %.3f cm (%s)   [precisa >= -0,08]" % (afu, afu_c))
    sal, fmin, fabe, sal_onde = olho_fechado(formas, extra=extra)
    dizer("olho fechado: maior saliência do globo, dos reflexos e das pálpebras sobre a pele (olho girado até 34 graus): %.3f cm (%s)   [precisa <= 0]; a fita sobre a pele: mais baixa %.3f cm   [precisa >= 0,01]; a fita com o olho aberto: mais alta %.3f cm   [precisa <= -0,2]" % (sal, sal_onde, fmin, fabe))
    cant, cant_c = cantos(formas, cen)
    dizer("distância máxima entre a pálpebra de cima e a de baixo nos cantos: %.3f cm (%s)   [precisa <= 0,05]" % (cant, cant_c))
    c = G.centro_do_olho(+1)
    pior_mancha = 0
    for rot, cam in (("de frente", ((c[0], -30.0, c[2]), (c[0], -4.0, c[2]), 8.0)), ("de 3/4", ((c[0] + 14, -27.0, c[2] + 3), (c[0], -4.0, c[2]), 8.0))):
        tot, det = manchas(formas, cen if lod["nome"] == "alta" else cen[::2], cam)
        pior = max([n for _, n in det] + [0])
        pior_mancha = max(pior_mancha, pior)
        dizer("pixels de látex cercados de olho, %s, em %d cenas: %d no total, no máximo %d numa cena (150x100 px)   [precisa <= 8 por cena]" % (rot, len(cen), tot, pior))
        for r, n in det[:6]:
            dizer("    %s: %d" % (r, n))
    iris = {}
    if not rapido:
        res = iris_visivel(formas, (0, 24, 30, 34, 36, 42), D.LIMITE_DO_OLHAR, extra=extra)
        for g in (0, 24, 30, 34, 36, 42):
            dizer("íris visível com o olhar a %d graus: " % g + ", ".join("%s %.0f%%" % (d, 100 * f) for d, gg, f in res if gg == g))
        iris = {g: min(f for d, gg, f in res if gg == g) for g in (0, 24, 30, 34, 36, 42)}
    return {"fresta_cm": round(fre, 3), "afundar_cm": round(afu, 3), "saliencia_do_olho_fechado_cm": round(sal, 3), "fita_fechada_min_cm": round(fmin, 3),
            "cantos_cm": round(cant, 3), "mancha_px_max": pior_mancha, "iris_visivel_min_por_graus": {str(g): round(f, 3) for g, f in iris.items()}}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    saida = argv[0] if argv else None
    rapido = "rapido" in argv
    linhas = []

    def dizer(txt=""):
        print(txt)
        linhas.append(txt)

    for lod in (G.ALTA, G.BAIXA):
        dizer("== nível %s ==" % lod["nome"])
        formas = Formas(lod)
        cen = cenarios_do_jogo()
        if rapido:
            cen = cen[::5]
        medir(formas, lod, {}, "olho_normal (o do P7b)", rapido, dizer)
        seg = {c_: abertura_segura(formas, c_) for c_ in D.FORMAS if c_.startswith("cara_")}
        dizer("abertura segura (teto do multiplicador das pálpebras que seguem o olhar) x abertura no meta: " + ", ".join("%s %.2f/%.2f" % (n.replace("cara_", ""), seg[n], D.abertura_da_cara(n)) for n in seg))
        ks = {c_: peso_da_cara_na_piscadinha(formas, c_) for c_ in D.FORMAS if c_.startswith("cara_")}
        dizer("piscadinha: maior peso da cara somada a piscar_esq/dir sem fresta nem afundar: " + ", ".join("%s %.2f" % (n.replace("cara_", ""), k) for n, k in ks.items()))
        for f in D.FORMAS_DE_ESTILO:
            medir(formas, lod, {f: 1.0}, "olho_" + f[len("estilo_"):] + " (" + f + " no peso 1)", rapido, dizer)
    if saida:
        os.makedirs(os.path.dirname(os.path.abspath(saida)), exist_ok=True)
        open(saida, "w").write("\n".join(linhas) + "\n")


if __name__ == "__main__":
    main()

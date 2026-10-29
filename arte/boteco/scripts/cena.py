"""O boteco em volta da mesa, em geometria pura (numpy): `construir(lod)` devolve uma `Cena` com as malhas por grupo e material,
os marcadores (luzes e câmeras) e os dados para a conferência. Roda dentro e fora do Blender (`construir.py` leva a cena ao Blender, assa a luz e exporta o .glb).

Eixos e escala = os do jogo (metros): origem no centro do pano, X ao longo da mesa, Y para cima, Z na largura. O piso fica em y = -0,8
(`alturaDoPiso` do jogo). A mesa NÃO está aqui. Folga: nada abaixo de 2,1 m do piso entra na faixa de 1,6 m em volta da mesa (fora a luminária).

lod: 0 = baixo (só o essencial), 1 = médio, 2 = alto. Os adereços (balcão, garrafas, geladeiras, TV, estufa, fiação, cartazes...) estão em `aderecos.py`.
"""
import math
import random
from contextlib import contextmanager

import numpy as np

import aderecos
import geom
import marca
import mobilia
from mobilia import banqueta, cadeira, mesinha
from const import (BALCAO, FOLGA, H_AZULEJO, H_BARRADO, JANELA, LUMINARIA_Y, MESA_COMPRIMENTO, MESA_LARGURA, MESA_MOLDURA, MESA_TABELA, PISO, SEMI_X, SEMI_Z, TETO,
                   TOPO_BALCAO, VENT, X0, X1, Z0, Z1, quad_parede, sg)
from geom import I4, Malha, caixa, caixa_chanfrada, cilindro, disco, laje, lathe, mat, orientada, perfil_suave, quad, tubo

# Classe de cada material: "a" = assado (a luz do Blender vai para a textura e no .glb sai sem luz, KHR_materials_unlit; `dest` é o nome do material no .glb,
# `dens` o peso da densidade de texels no atlas); "p" = PBR de verdade (vidro, metal, rótulos); "e" = emissivo (néon, tela, janela). As receitas das
# fontes assadas (fotos CC0 mais sujeira) estão em `blender_mat.py`; as cores dos "p" e "e" são as de sempre (cor em sRGB 0..1; tex = arquivo em texturas/<nivel>/).
MATERIAIS = {
    "reboco": dict(c="a", dest="paredes", dens=1.2),
    "azulejo": dict(c="a", dest="paredes", dens=1.35),
    "barrado": dict(c="a", dest="paredes", dens=1.5),
    "rodape": dict(c="a", dest="paredes", dens=1.3),
    "piso": dict(c="a", dest="piso", dens=1.5),
    "forro": dict(c="a", dest="forro", dens=0.5),
    "viga": dict(c="a", dest="forro", dens=0.7),
    "madeira": dict(c="a", dest="assado", dens=1.8),
    "madeira-clara": dict(c="a", dest="assado", dens=1.4),
    "formica": dict(c="a", dest="assado", dens=1.4),
    "vinil": dict(c="a", dest="assado", dens=1.4, cor=(0.42, 0.06, 0.05)),
    "ferro": dict(c="a", dest="assado", dens=1.2, cor=(0.05, 0.05, 0.055)),
    "plastico-branco": dict(c="a", dest="assado", dens=1.4, cor=(0.82, 0.82, 0.78)),
    "plastico-vermelho": dict(c="a", dest="assado", dens=1.4, cor=(0.55, 0.04, 0.035)),
    "plastico-preto": dict(c="a", dest="assado", dens=1.2, cor=(0.025, 0.025, 0.03)),
    "plastico-azul": dict(c="a", dest="assado", dens=1.4, cor=(0.08, 0.2, 0.5)),
    "folha": dict(c="a", dest="assado", dens=1.2, cor=(0.1, 0.3, 0.1)),
    "borracha": dict(c="a", dest="assado", dens=0.8, cor=(0.012, 0.012, 0.014)),
    "geladeira": dict(c="a", dest="assado", dens=1.0, cor=(0.82, 0.84, 0.85)),
    "ceramica": dict(c="a", dest="assado", dens=1.6, cor=(0.55, 0.22, 0.1)),
    "salgado": dict(c="a", dest="assado", dens=2.0, cor=(0.62, 0.34, 0.1)),
    "ovo": dict(c="a", dest="assado", dens=1.5, cor=(0.85, 0.8, 0.62)),
    "aco": dict(c="a", dest="assado", dens=1.2),
    "quadro": dict(c="a", dest="assado", dens=2.6, dest_med="cartazes", dens_med=(0.9, 0.9), tex="quadro.jpg", rug=0.9),
    "decoracao": dict(c="a", dest="decoracao", dens=1.6, tex="decoracao.jpg", rug=0.7, duas_faces=True),
    "sinal:geladeira-porta": dict(c="a", dest="assado", dens=6.0, dest_med="cartazes", dens_med=(0.75, 0.75), tex="sinais/geladeira-porta.jpg", rug=0.35),
    "sinal:logo-mesa": dict(c="a", dest="assado", dens=2.5, dest_med="cartazes", dens_med=(1.0, 1.0), tex="sinais/logo-mesa.jpg", rug=0.4),
    "sinal:logo-cadeira-a": dict(c="a", dest="assado", dens=3.0, dest_med="cartazes", dens_med=(1.3, 1.3), tex="sinais/logo-cadeira-a.jpg", rug=0.4),
    "sinal:logo-cadeira-b": dict(c="a", dest="assado", dens=3.0, dest_med="cartazes", dens_med=(1.3, 1.3), tex="sinais/logo-cadeira-b.jpg", rug=0.4),
    # PBR (o jogo ilumina): vidro, metal, rótulos
    # vidros: casca em alfa (o three desenha por último, sem escrever profundidade) com o líquido opaco por dentro; só a face da frente
    "vidro-ambar": dict(c="p", cor=(0.42, 0.17, 0.03), rug=0.08, alfa=True, opac=0.5),
    "vidro-verde": dict(c="p", cor=(0.03, 0.26, 0.09), rug=0.08, alfa=True, opac=0.52),
    "vidro-claro": dict(c="p", cor=(0.72, 0.84, 0.8), rug=0.06, alfa=True, opac=0.26),
    "vidro-pet": dict(c="p", cor=(0.78, 0.86, 0.82), rug=0.1, alfa=True, opac=0.3),
    "vidro-estufa": dict(c="p", cor=(0.8, 0.9, 0.9), rug=0.05, alfa=True, opac=0.16, duas_faces=True),
    "liquido-ambar": dict(c="p", cor=(0.34, 0.12, 0.012), rug=0.14),
    "liquido-licor": dict(c="p", cor=(0.3, 0.1, 0.02), rug=0.14),
    "liquido-vinho": dict(c="p", cor=(0.1, 0.012, 0.03), rug=0.14),
    "liquido-guarana": dict(c="p", cor=(0.42, 0.2, 0.03), rug=0.14),
    "liquido-laranja": dict(c="p", cor=(0.62, 0.23, 0.02), rug=0.14),
    "liquido-claro": dict(c="p", cor=(0.8, 0.9, 0.88), rug=0.05, alfa=True, opac=0.12),
    "espuma": dict(c="p", cor=(0.92, 0.9, 0.82), rug=0.7),
    "rolha": dict(c="p", cor=(0.55, 0.38, 0.2), rug=0.9),
    "capsula": dict(c="p", cor=(0.5, 0.04, 0.05), metal=0.6, rug=0.3),
    "tampa-vermelha": dict(c="p", cor=(0.62, 0.05, 0.04), metal=0.55, rug=0.3),
    "tampa-plastico": dict(c="p", cor=(0.7, 0.08, 0.06), rug=0.4),
    "tampa": dict(c="p", cor=(0.75, 0.55, 0.12), metal=0.5, rug=0.35),
    "cromado": dict(c="p", cor=(0.78, 0.8, 0.82), metal=0.75, rug=0.3),
    "inox": dict(c="p", cor=(0.62, 0.64, 0.66), metal=0.7, rug=0.38),
    "rotulos": dict(c="p", tex="rotulos.jpg", rug=0.5),
    "madeira-pa": dict(c="p", cor=(0.36, 0.2, 0.1), rug=0.5),
    "prateleira-garrafas": dict(c="u", tex="prateleira.jpg", cor=(0.5, 0.5, 0.5), rug=0.9),   # desenhada e escurecida: só no baixo; sai sem luz, sem assar
    "luminaria-casco": dict(c="p", cor=(0.06, 0.3, 0.2), metal=0.3, rug=0.35),
    # emissivos
    "luminaria-luz": dict(c="e", cor=(1.0, 0.8, 0.52), emissivo=(1.0, 0.8, 0.52), rug=0.9),
    "lampada": dict(c="e", cor=(1.0, 0.75, 0.4), emissivo=(1.0, 0.72, 0.34), rug=0.4),
    "luz-estufa": dict(c="e", cor=(1.0, 0.7, 0.3), emissivo=(1.0, 0.62, 0.22), rug=0.5),
    "neon-placa": dict(c="a", dest="assado", dens=1.0, cor=(0.035, 0.03, 0.04), rug=0.6),
    "neon-rosa": dict(c="e", cor=(1.0, 0.2, 0.55), emissivo=(1.0, 0.18, 0.55), rug=0.3),
    "neon-ciano": dict(c="e", cor=(0.16, 0.85, 1.0), emissivo=(0.16, 0.85, 1.0), rug=0.3),
    "neon-ambar": dict(c="e", cor=(1.0, 0.7, 0.17), emissivo=(1.0, 0.7, 0.17), rug=0.3),
    "neon-branco": dict(c="e", cor=(1.0, 0.93, 0.7), emissivo=(1.0, 0.93, 0.7), rug=0.3),
    "letreiro": dict(c="e", cor=(0.0, 0.0, 0.0), emissivo_tex="letreiro.jpg", rug=0.5),
    "letreiro-halo": dict(c="e", cor=(0.0, 0.0, 0.0), emissivo_tex="letreiro-halo.png", alfa=True, rug=1.0, so_alto=True, duas_faces=True),
    "rua": dict(c="e", cor=(0.0, 0.0, 0.0), emissivo_tex="rua.jpg", rug=1.0),
    "rua-fundo": dict(c="e", cor=(0.0, 0.0, 0.0), emissivo_tex="rua-fundo.jpg", rug=1.0),
    "rua-fachada": dict(c="e", cor=(0.0, 0.0, 0.0), emissivo_tex="rua-fachada.jpg", rug=1.0),
    "rua-chao": dict(c="e", cor=(0.0, 0.0, 0.0), emissivo_tex="rua-chao.jpg", rug=1.0),
    "rua-placa": dict(c="e", cor=(0.0, 0.0, 0.0), emissivo_tex="rua-placa.jpg", rug=1.0, duas_faces=True),
    "poste-halo": dict(c="e", cor=(0.0, 0.0, 0.0), emissivo_tex="poste-halo.png", alfa=True, rug=1.0, duas_faces=True),
    "poste": dict(c="p", cor=(0.045, 0.045, 0.05), rug=0.8),
    "vidro-janela": dict(c="p", cor=(0.68, 0.72, 0.7), rug=0.06, alfa=True, opac=0.12, alfa_tex=True, tex="vidro-janela.png"),
    "caixilho": dict(c="a", dest="assado", dens=1.6, cor=(0.1, 0.3, 0.26)),
    "vitrine": dict(c="e", cor=(0.0, 0.0, 0.0), emissivo_tex="vitrine.jpg", rug=0.3),
    "tv-tela": dict(c="e", cor=(0.0, 0.0, 0.0), emissivo_tex="tv-tela.jpg", rug=0.3),
}


def destino(nome, lod):
    """Material do .glb (e atlas) em que a fonte `nome` cai neste nível: `dest_med` vale no médio e no alto, `dest` no baixo."""
    s = MATERIAIS[nome]
    return s["dest_med"] if lod >= 1 and "dest_med" in s else s.get("dest", "assado")


def dens(nome, lod):
    s = MATERIAIS[nome]
    return s["dens_med"][lod - 1] if lod >= 1 and "dens_med" in s else s.get("dens", 1.5)


class Cena:
    def __init__(self, lod):
        self.lod = lod
        self.grupos = {}      # grupo -> {material -> Malha}
        self.origem = {}      # grupo -> (x, y, z) em que fica a origem do objeto
        self.marcadores = []  # dicts: nome, tipo ('vazio'|'camera'), pos, alvo, extras
        self.objetos = {}     # nome do adereço -> [min(3), max(3)] dos vértices
        self.atual = None
        self.rng = random.Random(2610)

    def m(self, material, grupo="estatico"):
        g = self.grupos.setdefault(grupo, {})
        if material not in g:
            g[material] = Malha(self)
        return g[material]

    @contextmanager
    def objeto(self, nome):
        ant, self.atual = self.atual, nome
        yield
        self.atual = ant

    def _registrar(self, P):
        if not self.atual:
            return
        mn, mx = P.min(axis=0), P.max(axis=0)
        if self.atual.endswith("*"):   # cada peça é um adereço (fios, tomadas): a folga olha uma a uma
            self.objetos[f"{self.atual[:-1]}#{len(self.objetos)}"] = [mn, mx]
        elif self.atual in self.objetos:
            a = self.objetos[self.atual]
            a[0], a[1] = np.minimum(a[0], mn), np.maximum(a[1], mx)
        else:
            self.objetos[self.atual] = [mn, mx]

    def triangulos(self):
        return {g: sum(m.triangulos() for m in ms.values()) for g, ms in self.grupos.items()}

    def total(self):
        return sum(self.triangulos().values())

    def folga_minima(self, liberados=("luminaria",)):
        """Menor distância (m, no eixo mais folgado) entre a borda da mesa e um adereço abaixo de 2,1 m do piso; (valor, nome)."""
        melhor = (99.0, None)
        for nome, (mn, mx) in self.objetos.items():
            if nome.split("#")[0] in liberados or mn[1] > PISO + 2.1:
                continue
            gx = max(mn[0] - SEMI_X, -SEMI_X - mx[0], 0.0)
            gz = max(mn[2] - SEMI_Z, -SEMI_Z - mx[2], 0.0)
            g = max(gx, gz)
            if g < melhor[0]:
                melhor = (g, nome)
        return melhor

    def folga_violada(self, liberados=("luminaria",)):
        """Adereços (abaixo de 2,1 m do piso) que invadem a faixa de 1,6 m em volta da mesa."""
        ruins = []
        for nome, (mn, mx) in self.objetos.items():
            if nome.split("#")[0] in liberados or mn[1] > PISO + 2.1:
                continue
            if mx[0] > -(SEMI_X + FOLGA) + 1e-3 and mn[0] < SEMI_X + FOLGA - 1e-3 and mx[2] > -(SEMI_Z + FOLGA) + 1e-3 and mn[2] < SEMI_Z + FOLGA - 1e-3:
                ruins.append(nome)
        return ruins


# ------------------------------------------------------------------ casco: piso, teto, paredes (UV em metros; as receitas dividem pela escala da foto)
def _parede(c, lado, s0, s1, y0, y1, mat_):
    m = c.m(mat_)
    if s1 - s0 < 1e-6 or y1 - y0 < 1e-6:
        return
    if lado == "z-":
        pts = [(s0, y0, Z0), (s1, y0, Z0), (s1, y1, Z0), (s0, y1, Z0)]
        ss = [s0, s1, s1, s0]
    elif lado == "z+":
        pts = [(s1, y0, Z1), (s0, y0, Z1), (s0, y1, Z1), (s1, y1, Z1)]
        ss = [s1, s0, s0, s1]
    elif lado == "x-":
        pts = [(X0, y0, s1), (X0, y0, s0), (X0, y1, s0), (X0, y1, s1)]
        ss = [s1, s0, s0, s1]
    else:
        pts = [(X1, y0, s0), (X1, y0, s1), (X1, y1, s1), (X1, y1, s0)]
        ss = [s0, s1, s1, s0]
    ys = [y0, y0, y1, y1]
    ref = H_AZULEJO if mat_ == "barrado" else PISO
    quad(m, I4, *pts, *[(s, y - ref) for s, y in zip(ss, ys)])


def _regioes(c):
    r = [("azulejo", PISO, H_AZULEJO), ("barrado", H_AZULEJO, H_BARRADO), ("reboco", H_BARRADO, TETO)]
    if c.lod == 0:
        r = [("azulejo", PISO, H_AZULEJO), ("reboco", H_AZULEJO, TETO)]
    return r


def casco(c):
    quad(c.m("piso"), I4, (X0, PISO, Z1), (X1, PISO, Z1), (X1, PISO, Z0), (X0, PISO, Z0), (X0, Z1), (X1, Z1), (X1, Z0), (X0, Z0))
    quad(c.m("forro"), I4, (X0, TETO, Z0), (X1, TETO, Z0), (X1, TETO, Z1), (X0, TETO, Z1), (X0, Z0), (X1, Z0), (X1, Z1), (X0, Z1))
    for lado in ("z-", "x-", "x+"):
        a, b = (X0, X1) if lado == "z-" else (Z0, Z1)
        for mat_, y0, y1 in _regioes(c):
            _parede(c, lado, a, b, y0, y1, mat_)
    # parede da janela (z+): cada faixa menos o vão
    j = JANELA
    for mat_, y0, y1 in _regioes(c):
        lo, hi = max(y0, j["y0"]), min(y1, j["y1"])
        if hi <= lo:
            _parede(c, "z+", X0, X1, y0, y1, mat_)
            continue
        _parede(c, "z+", X0, X1, y0, lo, mat_)
        _parede(c, "z+", X0, X1, hi, y1, mat_)
        _parede(c, "z+", X0, j["x0"], lo, hi, mat_)
        _parede(c, "z+", j["x1"], X1, lo, hi, mat_)
    # batentes do vão (reboco), profundidade da parede, e a soleira de madeira
    m = c.m("reboco")
    d = j["prof"]
    x0, x1, y0, y1 = j["x0"], j["x1"], j["y0"], j["y1"]
    quad(m, I4, (x0, y0, Z1), (x0, y0, Z1 + d), (x0, y1, Z1 + d), (x0, y1, Z1), (Z1, y0 - PISO), (Z1 + d, y0 - PISO), (Z1 + d, y1 - PISO), (Z1, y1 - PISO))
    quad(m, I4, (x1, y0, Z1 + d), (x1, y0, Z1), (x1, y1, Z1), (x1, y1, Z1 + d), (Z1, y0 - PISO), (Z1 + d, y0 - PISO), (Z1 + d, y1 - PISO), (Z1, y1 - PISO))
    quad(m, I4, (x0, y1, Z1 + d), (x1, y1, Z1 + d), (x1, y1, Z1), (x0, y1, Z1), (x0, Z1), (x1, Z1), (x1, Z1 + d), (x0, Z1 + d))
    quad(c.m("madeira"), I4, (x0, y0, Z1), (x1, y0, Z1), (x1, y0, Z1 + d), (x0, y0, Z1 + d), (x0, Z1), (x1, Z1), (x1, Z1 + d), (x0, Z1 + d))


# ------------------------------------------------------------------ banquetas, mesinha de plástico e cadeiras (P6: `mobilia.py`)
def moveis(c):
    for i, z in enumerate((-2.7, -2.1, -1.5, -0.9, -0.3, 0.3)):
        banqueta(c, -3.0, z, i)
    # mesinha 1, sob a janela (z+), duas cadeiras de lado; mesinha 2, no canto do fundo (z-)
    mesinha(c, -0.6, 2.78, 0)
    cadeira(c, -1.28, 2.78, 0, 0, "plastico-branco", "sinal:logo-cadeira-a")
    cadeira(c, 0.08, 2.78, 180, 1, "plastico-vermelho", "sinal:logo-cadeira-b")
    mesinha(c, 3.7, -2.78, 1)
    cadeira(c, 3.02, -2.78, 0, 2, "plastico-vermelho", "sinal:logo-cadeira-b")
    cadeira(c, 4.38, -2.78, 180, 3, "plastico-branco", "sinal:logo-cadeira-a")


# ------------------------------------------------------------------ ventilador de teto, luminária, lâmpadas pendentes


def ventilador(c):
    """Ventilador de teto de pás de madeira: canopla e haste de ferro, motor de perfil suave, quatro pás de borda filetada presas por braços chatos, corrente de puxar."""
    L = c.lod
    if L == 0:
        return
    hub = (VENT["x"], TETO - 0.5, VENT["z"])
    with c.objeto("ventilador"):
        fe = c.m("ferro")
        lathe(fe, mat((VENT["x"], TETO - 0.055, VENT["z"])), perfil_suave([(0, 0), (0.075, 0, "duro"), (0.06, 0.03), (0.025, 0.055, "duro"), (0, 0.055)], 2) if L == 2
              else [(0, 0), (0.07, 0, "duro"), (0.03, 0.05), (0, 0.055)], sg(c, 4, 8, 16))
        cilindro(fe, mat((VENT["x"], hub[1] + 0.04, VENT["z"])), 0.012, TETO - 0.055 - hub[1] - 0.04, sg(c, 4, 6, 10), tampas=False)
        lathe(fe, mat(hub), perfil_suave([(0, -0.05), (0.055, -0.05, "duro"), (0.085, -0.02), (0.088, 0.02), (0.06, 0.055), (0.03, 0.068), (0.0, 0.068)], 2) if L == 2
              else [(0, -0.05), (0.055, -0.05), (0.085, -0.01), (0.085, 0.04), (0.04, 0.065), (0.0, 0.065)], sg(c, 4, 8, 18))
        if L == 2:   # corrente de puxar com as contas
            for k in range(5):
                geom.cilindro(c.m("cromado"), mat((hub[0] + 0.04, hub[1] - 0.058 - 0.012 * k, hub[2] + 0.02)), 0.0032, 0.011, 6)
            tubo(c.m("cromado"), I4, [(hub[0] + 0.04, hub[1] - 0.058, hub[2] + 0.02), (hub[0] + 0.04, hub[1] - 0.14, hub[2] + 0.02)], 0.0014, 3, tampas=False)
    c.origem["ventilador-helice"] = hub
    with c.objeto("ventilador-helice"):
        mm = c.m("madeira-pa", "ventilador-helice")
        fe = c.m("ferro", "ventilador-helice")
        n = 4
        for k in range(n):
            T = mat(hub, yaw=k * 360 / n + 20)
            if L == 2:
                laje(mm, T @ mat((0.43, -0.02, 0), rx=10), 0.56, 0.13, 0.014, rc=0.05, rb=0.005, n_c=3, n_b=1)
                caixa_chanfrada(fe, T @ mat((0.17, -0.03, 0), rx=4), (0.15, 0.008, 0.034), 0.003, esc=1.0)
                for dx in (0.12, 0.2):
                    cilindro(fe, T @ mat((dx, -0.0265, 0)), 0.006, 0.004, 6)
            else:
                caixa(mm, T @ mat((0.42, -0.02, 0), rx=10), (0.56, 0.014, 0.13), esc=1.0)
        if L == 2:
            lathe(fe, mat(hub), perfil_suave([(0, -0.075), (0.075, -0.075, "duro"), (0.1, -0.055), (0.092, -0.04, "duro"), (0, -0.04)], 2), 18)


def _calha(c, m, a, y, b, t, alt):
    """Casco da luminária: calha de seção trapezoidal de cantos arredondados (um perfil varrido ao longo do comprimento), parede dupla, aba de baixo e as tampas das pontas."""
    comp = 2 * a
    perfil = [(-b, 0.0), (-t - 0.016, alt - 0.04), (-t + 0.014, alt), (t - 0.014, alt), (t + 0.016, alt - 0.04), (b, 0.0)]
    pts = np.array(geom.spline(perfil, sg(c, 1, 2, 4)), float)

    def ao_longo(P_):
        def f(v):
            s = v * (len(P_) - 1)
            i = min(int(s), len(P_) - 2)
            return P_[i] * (1 - (s - i)) + P_[i + 1] * (s - i)
        return f

    ext = ao_longo(pts)
    espessura = 0.012
    tg = np.gradient(pts, axis=0)
    nrm = np.stack([-tg[:, 1], tg[:, 0]], axis=1)
    nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-9)
    centro = np.array([0.0, alt * 0.45])
    nrm *= np.sign(((centro - pts) * nrm).sum(axis=1, keepdims=True) + 1e-9)
    pin = pts + espessura * nrm
    inte = ao_longo(pin)
    nv = len(pts) - 1
    ref = (0.0, y + alt * 0.45, 0.0)

    def sup(f):
        return lambda u, v: (-a + comp * u, y + f(v)[1], f(v)[0])

    orientada(m, I4, sup(ext), sg(c, 1, 1, 2), nv, ref, True)
    if c.lod >= 1:
        orientada(m, I4, sup(inte), sg(c, 1, 1, 2), nv, ref, False)
        for lado in (0, nv):   # aba da borda, voltada para baixo
            pa, pb = pts[lado], pin[lado]
            orientada(m, I4, lambda u, v, pa=pa, pb=pb: (-a + comp * u, y + pa[1] + (pb[1] - pa[1]) * v, pa[0] + (pb[0] - pa[0]) * v), 1, 1, ref, True)
    for sx in (-1, 1):   # tampas das pontas: leque a partir do centro do perfil
        P_ = [(sx * a, y + alt * 0.45, 0.0)] + [(sx * a, y + p[1], p[0]) for p in pts]
        F = [(0, 1 + i, 2 + i) if sx > 0 else (0, 2 + i, 1 + i) for i in range(len(pts) - 1)]
        N = [(sx, 0.0, 0.0)] * len(P_)
        UV = [(p[2], p[1]) for p in P_]
        m.add(I4, P_, N, UV, F)


def luminaria(c):
    """A luminária comprida da mesa: calha verde de cantos arredondados com o painel aceso, nervuras do difusor e dois cabos com argola para o teto. Grupo próprio, origem em (0, 0,9, 0)."""
    L = c.lod
    c.origem["luminaria"] = (0.0, LUMINARIA_Y, 0.0)
    comp, larg_b, larg_t, alt = 1.5, 0.34, 0.22, 0.13
    y = LUMINARIA_Y
    a, b, t = comp / 2, larg_b / 2, larg_t / 2
    with c.objeto("luminaria"):
        ca = c.m("luminaria-casco", "luminaria")
        lu = c.m("luminaria-luz", "luminaria")
        quad(lu, I4, (-a + 0.01, y + 0.004, b - 0.01), (a - 0.01, y + 0.004, b - 0.01), (a - 0.01, y + 0.004, -b + 0.01), (-a + 0.01, y + 0.004, -b + 0.01), (0, 0), (1, 0), (1, 1), (0, 1))
        if L == 0:
            V = {"bn": (-a, y, -b), "bp": (a, y, -b), "bq": (a, y, b), "br": (-a, y, b),
                 "tn": (-a, y + alt, -t), "tp": (a, y + alt, -t), "tq": (a, y + alt, t), "tr": (-a, y + alt, t)}
            verts, fl = [], []
            for f in (("bn", "bp", "tp", "tn"), ("bq", "br", "tr", "tq"), ("tn", "tp", "tq", "tr"), ("br", "bn", "tn", "tr"), ("bp", "bq", "tq", "tp")):
                base = len(verts)
                verts += [V[k] for k in f]
                fl.append([base + i for i in range(4)])
            geom._flat(I4, ca, verts, fl, lambda p, n: (p[0], p[1] * 3 + p[2]))
        else:
            _calha(c, ca, a, y, b, t, alt)
            if L == 2:
                for xx in (-0.5, -0.25, 0.0, 0.25, 0.5):   # nervuras do difusor
                    caixa_chanfrada(ca, mat((xx, y + 0.011, 0)), (0.014, 0.012, larg_b - 0.016), 0.002, esc=1.0)
        fe = c.m("ferro", "luminaria")
        for sx in (-1, 1):
            if L >= 1:
                tubo(fe, I4, [(sx * 0.55, y + alt, 0), (sx * 0.55, TETO - 0.01, 0)], 0.0045, sg(c, 3, 4, 6), tampas=False)
            else:
                caixa(fe, mat((sx * 0.55, (y + alt + TETO) / 2, 0)), (0.01, TETO - y - alt, 0.01))
        if L == 2:
            for sx in (-1, 1):
                lathe(fe, mat((sx * 0.55, y + alt, 0)), perfil_suave([(0, 0), (0.026, 0, "duro"), (0.02, 0.01), (0.009, 0.02), (0, 0.022)], 2), 12)
                lathe(fe, mat((sx * 0.55, TETO - 0.03, 0)), perfil_suave([(0, 0), (0.045, 0, "duro"), (0.04, 0.014), (0.02, 0.028), (0, 0.03)], 2), 14)
                tubo(fe, I4, [(sx * 0.55, y + alt + 0.02, 0.0), (sx * 0.55, y + alt + 0.045, 0.0)], 0.0075, 6)   # pé do suporte do cabo


# ------------------------------------------------------------------ porta do banheiro, vigas, rodapé
def porta_banheiro(c):
    L = c.lod
    if L == 0:
        return
    with c.objeto("porta-banheiro"):
        mm = c.m("madeira-clara")
        caixa(mm, mat((X0 + 0.04, PISO + 1.05, 2.7)), (0.06, 2.1, 0.9), esc=1.0)
        if L == 2:
            for s in (-1, 1):
                caixa(mm, mat((X0 + 0.035, PISO + 1.05, 2.7 + s * 0.5)), (0.07, 2.18, 0.1), esc=1.0)
            caixa(mm, mat((X0 + 0.035, PISO + 2.14, 2.7)), (0.07, 0.1, 1.1), esc=1.0)
            tubo(c.m("cromado"), I4, [(X0 + 0.1, PISO + 1.0, 2.38), (X0 + 0.1, PISO + 1.0, 2.46)], 0.012, 6)
            caixa(c.m("cromado"), mat((X0 + 0.08, PISO + 1.0, 2.42)), (0.03, 0.12, 0.05))


def detalhes(c):
    if c.lod < 1:
        return
    with c.objeto("vigas"):
        mm = c.m("viga")
        for x in (-3.8, -1.9, 0.0, 1.9, 3.8):
            caixa(mm, mat((x, TETO - 0.1, 0)), (0.16, 0.2, Z1 - Z0), esc=1.0)
    mm = c.m("rodape")
    e = 0.014
    for i, (pos, tam) in enumerate((((0, PISO + 0.05, Z0 + e / 2), (X1 - X0, 0.1, e)), ((0, PISO + 0.05, Z1 - e / 2), (X1 - X0, 0.1, e)),
                                    ((X1 - e / 2, PISO + 0.05, 0), (e, 0.1, Z1 - Z0)), ((X0 + e / 2, PISO + 0.05, 0), (e, 0.1, Z1 - Z0)))):
        with c.objeto(f"rodape#{i}"):
            caixa(mm, mat(pos), tam, esc=1.0)


# ------------------------------------------------------------------ janela da rua e letreiro de néon (P6: caixilho com espessura, vidro sujo, grade de ferro, rua em camadas)
RUA = dict(z_fachada=8.0, z_fundo=25.5, z_chao0=3.5, y_chao=-0.9, x0=-8.0, x1=6.0, y_teto=5.2)


def _camadas_da_rua(c):
    """A rua vista da janela, em camadas emissivas com paralaxe: o fundo (céu e prédios, a 22 m), a fachada do outro lado (4,6 m), o chão com a luz do poste, o poste e uma placa de hotel."""
    r = RUA
    cx = (JANELA["x0"] + JANELA["x1"]) / 2
    m = lambda nome: c.m(nome, "janela-rua")   # noqa: E731
    zf = r["z_fachada"]
    # fundo: 40 x 14 m
    xa, xb, ya, yb, zz = cx - 20.0, cx + 20.0, -1.6, 12.4, r["z_fundo"]
    quad(m("rua-fundo"), I4, (xb, ya, zz), (xa, ya, zz), (xa, yb, zz), (xb, yb, zz), (0, 0), (1, 0), (1, 1), (0, 1))
    # fachada: x de -8 a 6, do chão da rua (-0,9) a 5,2 m
    quad(m("rua-fachada"), I4, (r["x1"], r["y_chao"], zf), (r["x0"], r["y_chao"], zf), (r["x0"], r["y_teto"], zf), (r["x1"], r["y_teto"], zf), (0, 0), (1, 0), (1, 1), (0, 1))
    # chão: do pé da janela (z = 3,5) até a fachada (visto de cima, normal +y)
    quad(m("rua-chao"), I4, (r["x0"], r["y_chao"], r["z_chao0"]), (r["x1"], r["y_chao"], r["z_chao0"]), (r["x1"], r["y_chao"], zf), (r["x0"], r["y_chao"], zf), (0, 0), (1, 0), (1, 1), (0, 1))
    if c.lod == 1:
        return
    # poste de concreto com braço e luminária (a luz amarela): fica à direita da janela, a 4 m dela
    px, pz = 0.95, 4.2
    seg = sg(c, 5, 6, 10)
    po = m("poste")
    geom.tubo(po, I4, [(px, r["y_chao"], pz), (px, 1.2, pz), (px, 2.55, pz)], [0.085, 0.06, 0.045], seg, tampas=True)
    geom.tubo(po, I4, geom.spline([(px, 2.5, pz), (px - 0.15, 2.8, pz), (px - 0.6, 2.9, pz), (px - 1.0, 2.72, pz)], 3), 0.028, 6, tampas=True)
    geom.caixa_redonda(po, mat((px - 1.15, 2.62, pz)), (0.5, 0.12, 0.2), 0.04, 2)
    geom.caixa(m("lampada"), mat((px - 1.15, 2.555, pz)), (0.4, 0.015, 0.14))
    caixa(po, mat((px + 0.0, 1.5, pz - 0.075)), (0.22, 0.45, 0.07))   # caixa de medição presa no poste
    # brilho da luminária (alfa suave) e placa de hotel
    quad(m("poste-halo"), I4, (px - 0.55, 2.0, pz - 0.02), (px - 1.75, 2.0, pz - 0.02), (px - 1.75, 3.25, pz - 0.02), (px - 0.55, 3.25, pz - 0.02), (0, 0), (1, 0), (1, 1), (0, 1))
    hx, hy, hz = cx - 1.35, 1.75, 5.4
    giro = math.radians(35)
    d = (math.cos(giro) * 0.26, 0, -math.sin(giro) * 0.26)
    quad(m("rua-placa"), I4, (hx + d[0], hy - 0.7, hz + d[2]), (hx - d[0], hy - 0.7, hz - d[2]), (hx - d[0], hy + 0.7, hz - d[2]), (hx + d[0], hy + 0.7, hz + d[2]), (0, 0), (1, 0), (1, 1), (0, 1))
    geom.tubo(po, I4, [(hx, hy + 0.7, hz), (hx, hy + 0.8, hz), (hx, hy + 0.8, hz - 0.0), (hx + 0.0, hy + 1.0, zf - 0.04)], 0.012, 4, tampas=False)


def janela(c):
    L = c.lod
    j = JANELA
    cx, cy = (j["x0"] + j["x1"]) / 2, (j["y0"] + j["y1"]) / 2
    zp = Z1 + j["prof"] + 0.55
    wp, hp = 4.4, 2.2
    c.origem["janela-rua"] = (cx, cy, zp)
    with c.objeto("janela-rua"):
        if L == 0:
            m = c.m("rua", "janela-rua")
            quad(m, I4, (cx + wp / 2, cy - hp / 2 - 0.2, zp), (cx - wp / 2, cy - hp / 2 - 0.2, zp), (cx - wp / 2, cy + hp / 2 - 0.2, zp), (cx + wp / 2, cy + hp / 2 - 0.2, zp), (0, 0), (1, 0), (1, 1), (0, 1))
        else:
            _camadas_da_rua(c)
    if L == 0:
        return
    W, H = j["x1"] - j["x0"], j["y1"] - j["y0"]
    with c.objeto("janela-grade"):
        fe = c.m("ferro")
        zg = Z1 + 0.045
        n = 13 if L == 2 else 7
        # grade de ferro: moldura chata, barras redondas, três travessas com rebite em cada cruzamento
        for y in (j["y0"] + 0.025, j["y1"] - 0.025):
            caixa(fe, mat((cx, y, zg)), (W - 0.02, 0.05, 0.016))
        for x in (j["x0"] + 0.035, j["x1"] - 0.035):
            caixa(fe, mat((x, cy, zg)), (0.05, H - 0.02, 0.016))
        ys_t = (j["y0"] + H * 0.3, j["y0"] + H * 0.68)
        for y in ys_t:
            caixa(fe, mat((cx, y, zg - 0.012)), (W - 0.06, 0.03, 0.014)) if L == 2 else caixa(fe, mat((cx, y, zg - 0.012)), (W - 0.06, 0.03, 0.014))
        for i in range(n):
            x = j["x0"] + 0.1 + (W - 0.2) * i / (n - 1)
            if L == 2:
                tubo(fe, I4, [(x, j["y0"] + 0.04, zg), (x, j["y1"] - 0.04, zg)], 0.0105, 8, tampas=True)
                for y in ys_t:
                    caixa(fe, mat((x, y, zg - 0.02)), (0.026, 0.026, 0.012))
                lathe(fe, mat((x, j["y1"] - 0.045, zg)), [(0.0, 0.0), (0.016, 0.0, "duro"), (0.0185, 0.012), (0.012, 0.026), (0.0, 0.03)], 6)  # ponta de lança
            else:
                caixa(fe, mat((x, cy, zg)), (0.024, H - 0.06, 0.022))
    with c.objeto("janela-caixilho"):
        # caixilho de madeira pintado, com espessura (duas folhas, divisória e travessa) no fundo do vão, e o vidro sujo em quatro painéis
        cm = c.m("caixilho")
        zc = Z1 + 0.17
        e, p = 0.055, 0.07
        cham = 0.006
        sub = caixa_chanfrada if L == 2 else (lambda m_, T_, t_, c_, esc=1.0: caixa(m_, T_, t_, esc=esc))
        sub(cm, mat((cx, j["y0"] + e / 2, zc)), (W, e, p), cham, esc=1.0)
        sub(cm, mat((cx, j["y1"] - e / 2, zc)), (W, e, p), cham, esc=1.0)
        for x in (j["x0"] + e / 2, j["x1"] - e / 2):
            sub(cm, mat((x, cy, zc)), (e, H, p), cham, esc=1.0)
        sub(cm, mat((cx, cy, zc)), (e * 1.1, H - 2 * e, p), cham, esc=1.0)
        yt = j["y0"] + (H - 2 * e) * 0.62 + e
        for xm in (j["x0"] + (W / 2) / 2 + e / 4, j["x0"] + W * 0.75 - e / 4):
            sub(cm, mat((xm, yt, zc)), (W / 2 - 1.6 * e, 0.035, p * 0.8), cham * 0.6, esc=1.0)
        # vidros
        vg = c.m("vidro-janela")
        zv = zc - 0.004
        xs = [j["x0"] + e, cx - e * 0.55, cx + e * 0.55, j["x1"] - e]
        for (xa, xb) in ((xs[0], xs[1]), (xs[2], xs[3])):
            for (ya, yb) in ((j["y0"] + e, yt - 0.0175), (yt + 0.0175, j["y1"] - e)):
                quad(vg, I4, (xb, ya, zv), (xa, ya, zv), (xa, yb, zv), (xb, yb, zv), (0, 0), (1, 0), (1, 1), (0, 1))
        if L == 2:   # fecho e dobradiças
            ch = c.m("cromado")
            for xm in (cx - 0.08, cx + 0.08):
                tubo(ch, I4, [(xm, cy - 0.12, zc - p / 2 - 0.012), (xm, cy + 0.04, zc - p / 2 - 0.012)], 0.008, 8, tampas=True)
                caixa(ch, mat((xm, cy + 0.07, zc - p / 2 - 0.006)), (0.03, 0.04, 0.012))
            for x in (j["x0"] + 0.02, j["x1"] - 0.02):
                for y in (j["y0"] + 0.2, j["y1"] - 0.2):
                    caixa(c.m("ferro"), mat((x, y, zc - p / 2)), (0.016, 0.07, 0.008))
        # soleira de madeira, com o nariz arredondado
        mm = c.m("madeira")
        sub(mm, mat((cx, j["y0"] - 0.018, Z1 + j["prof"] / 2 - 0.02)), (W + 0.12, 0.036, j["prof"] + 0.08), 0.01, esc=1.0)


NEON_W = 2.03  # largura do quadro do letreiro (com a margem do brilho); o texto ocupa ~1,65 m
NEON_C = (X0 + 0.02, 1.95, -1.75)


def _rdp(pts, tol):
    if len(pts) < 3:
        return pts
    a, b = np.array(pts[0]), np.array(pts[-1])
    ab = b - a
    n2 = float(ab @ ab) or 1e-9
    d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / math.sqrt(n2) for p in pts[1:-1]]
    i = int(np.argmax(d))
    if d[i] > tol:
        esq = _rdp(pts[:i + 2], tol)
        dir_ = _rdp(pts[i + 1:], tol)
        return esq[:-1] + dir_
    return [pts[0], pts[-1]]


def letreiro(c):
    L = c.lod
    els, h_px = marca.elementos("completo", 2048, 190)
    k = NEON_W / 2048.0
    cx, cy, cz = NEON_C
    c.origem["neon"] = (cx, cy, cz)
    alt = h_px * k
    with c.objeto("letreiro"):
        if L <= 1:
            m = c.m("letreiro", "neon")
            x = cx + 0.018
            quad(m, I4, (x, cy - alt / 2, cz + NEON_W / 2), (x, cy - alt / 2, cz - NEON_W / 2), (x, cy + alt / 2, cz - NEON_W / 2), (x, cy + alt / 2, cz + NEON_W / 2), (0, 0), (1, 0), (1, 1), (0, 1))
            return
        caixa(c.m("neon-placa", "neon"), mat((cx + 0.015, cy, cz)), (0.03, alt, NEON_W))
        cores = {"rosa": "neon-rosa", "ciano": "neon-ciano", "ambar": "neon-ambar", "estrela": "neon-branco"}
        x = cx + 0.045
        for e in els:
            pts = [((px - 1024) * k, (h_px / 2 - py) * k) for px, py in e.pontos]
            if len(pts) == 1:
                continue
            if math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1]) < 1e-6:  # traço fechado: divide ao meio
                meio = len(pts) // 2
                pts = _rdp(pts[:meio + 1], 0.0011)[:-1] + _rdp(pts[meio:], 0.0011)
            else:
                pts = _rdp(pts, 0.0011)
            r = max(0.005, 0.5 * e.largura * k * 0.55)
            caminho = [(x, cy + py, cz - px) for px, py in pts]
            tubo(c.m(cores[e.cor], "neon"), I4, caminho, r, 6, tampas=False)
        m = c.m("letreiro-halo", "neon")
        xh = cx + 0.06
        quad(m, I4, (xh, cy - alt / 2, cz + NEON_W / 2), (xh, cy - alt / 2, cz - NEON_W / 2), (xh, cy + alt / 2, cz - NEON_W / 2), (xh, cy + alt / 2, cz + NEON_W / 2), (0, 0), (1, 0), (1, 1), (0, 1))


# ------------------------------------------------------------------ marcadores: luzes e câmeras do menu
def marcadores(c):
    L = []
    L.append(dict(nome="luz-luminaria", tipo="vazio", pos=(0.0, LUMINARIA_Y - 0.03, 0.0),
                  extras=dict(tipo="retangular", cor="#ffc680", temperaturaK=3000, intensidade=1.0, largura=1.5, profundidade=0.32,
                              direcao=[0, -1, 0], nota="luz principal: a mesma luminária do jogo; foco e luz retangular sobre o pano")))
    L.append(dict(nome="luz-neon", tipo="vazio", pos=(NEON_C[0] + 0.5, NEON_C[1], NEON_C[2]),
                  extras=dict(tipo="ponto", cor="#ff2d8c", intensidade=0.7, alcance=6.0, nota="rosa do letreiro; pode piscar (grupo `neon`)")))
    L.append(dict(nome="luz-balcao", tipo="vazio", pos=(-3.58, 1.2, -1.4),
                  extras=dict(tipo="ponto", cor="#ffb25a", intensidade=0.8, alcance=5.0, nota="lâmpadas pendentes sobre o balcão")))
    L.append(dict(nome="luz-janela", tipo="vazio", pos=(-0.6, 0.95, 2.95),
                  extras=dict(tipo="ponto", cor="#6a86ff", intensidade=0.35, alcance=4.5, nota="azul da noite e do poste, vindo da rua")))
    L.append(dict(nome="luz-salao", tipo="vazio", pos=(1.8, 2.2, -1.0),
                  extras=dict(tipo="ponto", cor="#ffd8a8", intensidade=0.45, alcance=10.0, nota="enchimento quente do salão (sem sombra), para o quadro e as paredes não sumirem")))
    cams = [
        ("camera-menu-1", (4.6, 1.6, 2.0), (-1.2, 0.35, -0.6)),
        ("camera-menu-2", (1.4, 0.75, 2.45), (-1.2, 0.35, -1.9)),
        ("camera-menu-3", (3.6, 0.55, 1.3), (-4.6, 0.95, -1.3)),
    ]
    for nome, pos, alvo in cams:
        L.append(dict(nome=nome, tipo="camera", pos=pos, alvo=alvo, extras=dict(fovGraus=50, alvo=list(alvo))))
    c.marcadores = L


def construir(lod):
    c = Cena(lod)
    casco(c)
    aderecos.balcao(c)
    aderecos.prateleiras(c)
    moveis(c)
    ventilador(c)
    luminaria(c)
    aderecos.fiacao(c)
    aderecos.geladeira(c)
    aderecos.cervejeira(c)
    aderecos.tv(c)
    aderecos.freezer(c)
    aderecos.porta_de_aco(c)
    aderecos.engradados(c)
    porta_banheiro(c)
    aderecos.murais(c)
    janela(c)
    letreiro(c)
    aderecos.decoracao(c)
    aderecos.cantinhos(c)
    detalhes(c)
    marcadores(c)
    return c


if __name__ == "__main__":
    for lod in (0, 1, 2):
        c = construir(lod)
        print(("baixo", "medio", "alto")[lod], c.total(), c.triangulos(), "folga:", c.folga_violada() or "ok", "mínima %.3f (%s)" % c.folga_minima())

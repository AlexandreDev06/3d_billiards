"""Gravura: pena, hachura, ouro e pergaminho em cima da `Tela` (P3: Dragon Lore e Howl).

Tudo é desenhado no "papel": x em mm a partir da linha do meio da peça (o que fica de frente para a câmera do jogo, u = 0,5), s em
mm contados da ponta do taco (a mesma régua do `q` das medidas). `Papel.P` leva (x, s) ao canvas, já com a compressão do cone, então um
círculo de 3 mm no papel continua sendo um círculo no taco. A figura é desenhada de pé, o alto aponta para a ponta (`Tela(girar=True)`).

Modos da `Tela`: "cor" pinta o que se vê; "emissivo" repete o desenho em preto e só acende o que pede `brilho`. O mapa de metal do Dragon
Lore usa o mesmo mecanismo: onde tem ouro, `brilho = (1, 1, 1)`; o resto sai preto.
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cor as C  # noqa: E402
import desenho as D  # noqa: E402
import medidas as M  # noqa: E402

BRANCO = (1.0, 1.0, 1.0)
PRETO = (0.0, 0.0, 0.0)


# ---- o papel -----------------------------------------------------------------------------------------------------------------

class Papel:
    """Coordenadas do papel (x mm da linha do meio, s mm da ponta) → canvas, e o caminho de volta."""

    def __init__(self, t, canal="cor"):
        """`canal`: "cor" (o que se vê), "emissivo" (o que acende) ou "metal" (o que é metal). Os dois últimos usam a `Tela` em modo
        emissivo: o que não pede `em=` (ou `me=`) sai preto."""
        self.t = t
        self.canal = canal
        self.s0 = t.q0_mm            # s do pé do canvas... no modo `girar` o alto do canvas é s menor
        self.s1 = t.q0_mm + t.H
        self.W = t.W

    def Y(self, s):
        return self.t.y_de_q(s / 1000.0)

    def S(self, y):
        return self.t.q_de_y(y) * 1000.0

    def P(self, x, s):
        y = self.Y(s)
        return (self.W / 2 + x * self.t.fh(y), y)

    def pts(self, lista):
        return [self.P(x, s) for (x, s) in lista]

    def inv(self, cx, cy):
        f = self.t.fh(cy)
        return ((cx - self.W / 2) / f, self.S(cy))

    def meia_volta(self, s):
        """Metade da circunferência (mm) na altura s: o que dá a volta no taco."""
        y = self.Y(s)
        return self.t.circ_em(y) / 2.0

    def visivel(self, s_lo, s_hi, folga=0.0):
        return s_hi >= self.s0 - folga and s_lo <= self.s1 + folga

    # ---- primitivas ------------------------------------------------------------------------------------------------------
    def _brilho(self, em, me):
        """O que a forma pede no canal atual: `em` (cor que acende) no emissivo, `me` (0 a 1) no metal."""
        if self.canal == "emissivo":
            return em
        if self.canal == "metal":
            if me is None:
                return None
            if callable(me):
                return lambda x, s: (lambda v: (v, v, v))(me(x, s))
            return (me, me, me)
        return None

    def poli(self, pts, cor, em=None, me=None, em_centro=None, me_centro=None, **kw):
        """Polígono em coordenadas do papel. `cor` pode ser função f(x_mm, s_mm); `em`/`me` (cor que acende / quanto é metal) idem."""
        if len(pts) < 3:
            return
        if self.canal != "cor" and em is None and me is None and kw.get("brilho") is None:
            # no canal escuro, uma forma sem brilho só precisa apagar o que está por baixo: preto
            cor = (0.0, 0.0, 0.0)
        cv = self.pts(pts)
        if callable(cor):
            c0 = cor
            cor = lambda cx, cy: c0(*self.inv(cx, cy))
        b = kw.get("brilho")
        if b is None:
            b = self._brilho(em, me)
        if callable(b):
            b0 = b
            b = lambda cx, cy: b0(*self.inv(cx, cy))
        if b is not None:
            kw["brilho"] = b
        bc = kw.get("brilho_centro")
        if bc is None and (em_centro is not None or me_centro is not None):
            bc = self._brilho(em_centro, me_centro)
        if bc is not None:
            kw["brilho_centro"] = bc
        if "centro" in kw and kw["centro"] is not None:
            kw["centro"] = self.P(*kw["centro"])
        self.t.poligono(cv, cor, **kw)

    def fita_perfil(self, eixo, larguras, perfil, em=None, me=None, alfa=1.0, laterais=5):
        """Fita ao longo de `eixo` (papel) com cor por posição lateral: `perfil(lat)` → (r, g, b), lat de -1 a 1 (borda a borda).
        `em(lat)` e `me(lat)` fazem o mesmo nos canais emissivo e metal. É o pincel de tubos: sombra nas bordas, luz no meio."""
        n = len(eixo)
        if n < 2:
            return
        t = self.t
        lote = t.lote_alfa if (callable(alfa) or alfa < 1.0) else t.lote_opaco
        z = t.z()
        tg = tangentes(eixo)
        lats = [-1.0 + 2.0 * j / (laterais - 1) for j in range(laterais)]
        if self.canal == "cor":
            f = perfil
        elif self.canal == "emissivo":
            f = em if em else (lambda l: (0.0, 0.0, 0.0))
        else:
            f = (lambda l: (lambda v: (v, v, v))(me(l))) if me else (lambda l: (0.0, 0.0, 0.0))
        lin = [C.linear(f(l)) for l in lats]
        alfa_fn = alfa if callable(alfa) else (lambda u: alfa)
        linhas = []
        for i in range(n):
            nx, ny = tg[i][1], -tg[i][0]
            w = (larguras[i] if isinstance(larguras, (list, tuple)) else larguras) / 2.0
            linhas.append([self.P(eixo[i][0] + nx * w * l, eixo[i][1] + ny * w * l) for l in lats])
        for i in range(n - 1):
            a0, a1 = alfa_fn(i / (n - 1)), alfa_fn((i + 1) / (n - 1))
            for j in range(laterais - 1):
                a, b, c_, d = linhas[i][j], linhas[i][j + 1], linhas[i + 1][j + 1], linhas[i + 1][j]
                lote.tri([(a[0], a[1], z), (b[0], b[1], z), (c_[0], c_[1], z)], [lin[j] + (a0,), lin[j + 1] + (a0,), lin[j + 1] + (a1,)])
                lote.tri([(a[0], a[1], z), (c_[0], c_[1], z), (d[0], d[1], z)], [lin[j] + (a0,), lin[j + 1] + (a1,), lin[j] + (a1,)])

    def contorno(self, pts, cor, d, **kw):
        """O mesmo polígono, `d` mm maior, por baixo: o traço de pena em volta de uma mancha."""
        cv = D.expandir(self.pts(pts), d)
        if self.canal != "cor":
            cor = (0.0, 0.0, 0.0)
        self.t.poligono(cv, cor, **kw)


# ---- geometria no papel ------------------------------------------------------------------------------------------------------

def bezier(p0, p1, p2, p3, n=24):
    return D.bezier(p0, p1, p2, p3, n)


def curva(pts, n=10, fechado=False):
    """Catmull-Rom pelos pontos."""
    return D.suave(pts, fechado, n)


def comprimento(pts):
    return sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]) for i in range(len(pts) - 1))


def reamostrar(pts, passo):
    """Pontos igualmente espaçados (`passo` mm) sobre a polilinha."""
    if len(pts) < 2:
        return list(pts)
    saida = [pts[0]]
    resto = passo
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        d = math.hypot(b[0] - a[0], b[1] - a[1])
        if d == 0:
            continue
        pos = resto
        while pos <= d:
            f = pos / d
            saida.append((a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f))
            pos += passo
        resto = pos - d
    if saida[-1] != pts[-1]:
        saida.append(pts[-1])
    return saida


def tangentes(pts):
    n = len(pts)
    ts = []
    for i in range(n):
        a = pts[max(i - 1, 0)]
        b = pts[min(i + 1, n - 1)]
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy) or 1.0
        ts.append((dx / d, dy / d))
    return ts


def fita_larga(eixo, larguras):
    """Polígono de uma fita em volta do eixo; larguras (lista do mesmo tamanho do eixo, ou função de 0..1)."""
    n = len(eixo)
    if callable(larguras):
        larguras = [larguras(i / (n - 1 or 1)) for i in range(n)]
    return D.fita(eixo, larguras)


def afinar(u, ponta0=0.18, ponta1=0.18, expoente=0.7):
    """Fator 0..1 que afina as duas pontas de um traço (u de 0 a 1)."""
    a = min(u / ponta0, 1.0) if ponta0 > 0 else 1.0
    b = min((1.0 - u) / ponta1, 1.0) if ponta1 > 0 else 1.0
    return max(min(a, b), 0.0) ** expoente


def dentro(pt, poly):
    return D.dentro(pt, poly)


def distancia_ao_contorno(pt, poly):
    x, y = pt
    melhor = 1e9
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy
        u = 0.0 if l2 == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / l2))
        d = math.hypot(x - (ax + u * dx), y - (ay + u * dy))
        if d < melhor:
            melhor = d
    return melhor


def _cortes(poly, p0, p1):
    """Intervalos [t0, t1] (0 a 1) do segmento p0→p1 que ficam dentro do polígono (regra par-ímpar)."""
    x0, y0 = p0
    dx, dy = p1[0] - x0, p1[1] - y0
    ts = []
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        den = dx * ey - dy * ex
        if abs(den) < 1e-12:
            continue
        tt = ((ax - x0) * ey - (ay - y0) * ex) / den
        uu = ((ax - x0) * dy - (ay - y0) * dx) / den
        if 0.0 <= uu < 1.0 and 0.0 <= tt <= 1.0:
            ts.append(tt)
    ts.sort()
    return [(ts[i], ts[i + 1]) for i in range(0, len(ts) - 1, 2)]


# ---- pena e hachura -------------------------------------------------------------------------------------------------------

def traco(pa, pts, larg, cor, suavizar=True, ponta0=0.15, ponta1=0.15, passo=0.8, **kw):
    """Um traço de pena: polilinha (papel) com largura `larg` (mm; número ou função de 0..1) que afina nas pontas."""
    if suavizar and len(pts) > 2:
        pts = curva(pts, 6)
    pts = reamostrar(pts, passo) if comprimento(pts) > passo * 2 else pts
    n = len(pts)
    if n < 2:
        return
    ws = []
    for i in range(n):
        u = i / (n - 1)
        w = larg(u) if callable(larg) else larg
        ws.append(max(w * afinar(u, ponta0, ponta1), 0.04))
    pa.poli(fita_larga(pts, ws), cor, **kw)


def linha(pa, a, b, larg, cor, **kw):
    """Segmento reto afilado nas duas pontas."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    d = math.hypot(dx, dy)
    if d < 1e-6:
        return
    nx, ny = -dy / d * larg / 2, dx / d * larg / 2
    m1 = (a[0] + dx * 0.25, a[1] + dy * 0.25)
    m2 = (a[0] + dx * 0.75, a[1] + dy * 0.75)
    pa.poli([a, (m1[0] + nx, m1[1] + ny), (m2[0] + nx, m2[1] + ny), b, (m2[0] - nx, m2[1] - ny), (m1[0] - nx, m1[1] - ny)], cor, **kw)


def hachurar(pa, poly, ang, espaco, larg, cor, sombra=None, passo=1.2, desloc=0.0, minimo=0.06, **kw):
    """Hachura paralela dentro de `poly` (papel): linhas a `ang` (rad) e `espaco` mm; a largura de cada linha segue `sombra(x, s)`
    (0 = nada, 1 = `larg`), o que faz o tom da gravura. Cada linha afina nas pontas."""
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    raio = math.hypot(max(xs) - min(xs), max(ys) - min(ys)) / 2 + espaco
    dx, dy = math.cos(ang), math.sin(ang)
    nx, ny = -dy, dx
    k = -raio + desloc
    while k <= raio:
        p0 = (cx + nx * k - dx * raio, cy + ny * k - dy * raio)
        p1 = (cx + nx * k + dx * raio, cy + ny * k + dy * raio)
        for (t0, t1) in _cortes(poly, p0, p1):
            a = (p0[0] + (p1[0] - p0[0]) * t0, p0[1] + (p1[1] - p0[1]) * t0)
            b = (p0[0] + (p1[0] - p0[0]) * t1, p0[1] + (p1[1] - p0[1]) * t1)
            comp = math.hypot(b[0] - a[0], b[1] - a[1])
            if comp < 0.6:
                continue
            n = max(2, int(comp / passo) + 1)
            amostras = [(a[0] + (b[0] - a[0]) * i / (n - 1), a[1] + (b[1] - a[1]) * i / (n - 1)) for i in range(n)]
            ws = []
            for i, (x, s) in enumerate(amostras):
                u = i / (n - 1)
                f = 1.0 if sombra is None else sombra(x, s)
                ws.append(max(larg * f * afinar(u, 0.2, 0.2, 0.6), 0.0))
            if max(ws) < larg * minimo:
                continue
            trechos = []
            atual = []
            for i, w in enumerate(ws):
                if w >= larg * minimo:
                    atual.append((amostras[i], w))
                else:
                    if len(atual) >= 2:
                        trechos.append(atual)
                    atual = []
            if len(atual) >= 2:
                trechos.append(atual)
            for tr in trechos:
                pa.poli(D.fita([p for p, _ in tr], [max(w, 0.03) for _, w in tr]), cor, **kw)
        k += espaco


def sombra_de_borda(poly, largura, expoente=1.2, piso=0.0, teto=1.0):
    """Tom 0..1 que cresce em direção à borda do polígono (a sombra de volume): 1 na borda, `piso` a `largura` mm para dentro."""
    def f(x, s):
        d = distancia_ao_contorno((x, s), poly)
        v = max(1.0 - d / largura, 0.0) ** expoente
        return piso + (teto - piso) * v
    return f


def mistura(a, b, t):
    t = min(max(t, 0.0), 1.0)
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def degrade_lin(p0, p1, paradas):
    """Função f(x, s) → cor: degradê linear de p0 a p1 com `paradas = [(pos 0..1, cor), ...]`."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    l2 = dx * dx + dy * dy or 1.0

    def f(x, s):
        u = min(max(((x - p0[0]) * dx + (s - p0[1]) * dy) / l2, 0.0), 1.0)
        for i in range(len(paradas) - 1):
            a, b = paradas[i], paradas[i + 1]
            if u <= b[0]:
                span = (b[0] - a[0]) or 1.0
                return mistura(a[1], b[1], (u - a[0]) / span)
        return paradas[-1][1]
    return f


def degrade_radial(c, rx, ry, c_in, c_out, forma=1.0):
    def f(x, s):
        d = min(math.hypot((x - c[0]) / rx, (s - c[1]) / ry), 1.0) ** forma
        return mistura(c_in, c_out, d)
    return f


# ---- ouro -----------------------------------------------------------------------------------------------------------------

OURO = dict(sombra=C.rgb("#7a5614"), medio=C.rgb("#c9982a"), luz=C.rgb("#f1d56c"), brilho=C.rgb("#fff4b8"))


def ouro_faixa(eixo_a, eixo_b, ouro=None):
    """Degradê de metal entre duas linhas: sombra → médio → luz → médio → sombra (ouro batido, 5 paradas)."""
    o = ouro or OURO
    return degrade_lin(eixo_a, eixo_b, [(0.0, o["sombra"]), (0.28, o["medio"]), (0.5, o["luz"]), (0.72, o["medio"]), (1.0, o["sombra"])])


# ---- pergaminho -----------------------------------------------------------------------------------------------------------

def _vetor_periodico(nt, t, escala_mm, esticar_y=1.0):
    """Vetor de ruído que fecha em volta do taco: (cos, sin) do ângulo e y, em células de `escala_mm`."""
    N = nt.nodes.new
    uv = N("ShaderNodeTexCoord")
    sep = N("ShaderNodeSeparateXYZ")
    nt.links.new(uv.outputs["UV"], sep.inputs[0])
    ang = N("ShaderNodeMath")
    ang.operation = "MULTIPLY"
    ang.inputs[1].default_value = 2 * math.pi
    nt.links.new(sep.outputs["X"], ang.inputs[0])
    cs = N("ShaderNodeMath")
    cs.operation = "COSINE"
    sn = N("ShaderNodeMath")
    sn.operation = "SINE"
    nt.links.new(ang.outputs[0], cs.inputs[0])
    nt.links.new(ang.outputs[0], sn.inputs[0])
    raio = t.W / (2 * math.pi) / escala_mm
    cx = N("ShaderNodeMath")
    cx.operation = "MULTIPLY"
    cx.inputs[1].default_value = raio
    cy = N("ShaderNodeMath")
    cy.operation = "MULTIPLY"
    cy.inputs[1].default_value = raio
    nt.links.new(cs.outputs[0], cx.inputs[0])
    nt.links.new(sn.outputs[0], cy.inputs[0])
    z = N("ShaderNodeMath")
    z.operation = "MULTIPLY"
    z.inputs[1].default_value = t.H / escala_mm * esticar_y
    nt.links.new(sep.outputs["Y"], z.inputs[0])
    comb = N("ShaderNodeCombineXYZ")
    nt.links.new(cx.outputs[0], comb.inputs["X"])
    nt.links.new(cy.outputs[0], comb.inputs["Y"])
    nt.links.new(z.outputs[0], comb.inputs["Z"])
    return comb.outputs[0]


def _ruido(nt, vetor, escala=1.0, detalhe=5.0, aspereza=0.55, distorcao=0.0, semente=0.0):
    r = nt.nodes.new("ShaderNodeTexNoise")
    r.noise_dimensions = "4D" if semente else "3D"
    r.inputs["Scale"].default_value = escala
    r.inputs["Detail"].default_value = detalhe
    r.inputs["Roughness"].default_value = aspereza
    r.inputs["Distortion"].default_value = distorcao
    if semente:
        r.inputs["W"].default_value = semente
    nt.links.new(vetor, r.inputs["Vector"])
    return r.outputs["Fac"]


def material_pergaminho(t, pal):
    """Pergaminho envelhecido em emissão pura: nuvens largas claras e escuras, fibras finas e manchas de umidade (todas periódicas).

    `pal`: base, claro, escuro, mancha (cores sRGB); `sem_manchas` e `forca` (0 a 1) ajustam o desgaste."""
    m = bpy.data.materials.new("pergaminho")
    if m.node_tree is None:
        m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    forca = pal.get("forca", 1.0)
    v_grande = _vetor_periodico(nt, t, 46.0)
    v_medio = _vetor_periodico(nt, t, 13.0)
    v_fino = _vetor_periodico(nt, t, 2.6, esticar_y=1.0)
    n_grande = _ruido(nt, v_grande, 1.0, 4.0, 0.55, 0.3, semente=pal.get("semente", 1.0))
    n_medio = _ruido(nt, v_medio, 1.0, 5.0, 0.6, 0.2, semente=pal.get("semente", 1.0) + 3.7)
    n_fino = _ruido(nt, v_fino, 1.0, 3.0, 0.7, 0.0, semente=pal.get("semente", 1.0) + 9.1)

    # tom: grande + médio num só valor, depois uma rampa escuro → base → claro
    soma = N("ShaderNodeMath")
    soma.operation = "ADD"
    soma.use_clamp = False
    nt.links.new(n_grande, soma.inputs[0])
    nt.links.new(n_medio, soma.inputs[1])
    meio = N("ShaderNodeMapRange")
    meio.inputs["From Min"].default_value = 0.55
    meio.inputs["From Max"].default_value = 1.35
    nt.links.new(soma.outputs[0], meio.inputs["Value"])
    rampa = N("ShaderNodeValToRGB")
    el = rampa.color_ramp.elements
    el[0].position, el[0].color = 0.0, C.linear(pal["escuro"]) + (1.0,)
    el[1].position, el[1].color = 1.0, C.linear(pal["claro"]) + (1.0,)
    e2 = el.new(0.46)
    e2.color = C.linear(pal["base"]) + (1.0,)
    nt.links.new(meio.outputs[0], rampa.inputs["Fac"])

    # fibras: o ruído fino modula a luz de leve
    fib = N("ShaderNodeMapRange")
    fib.inputs["From Min"].default_value = 0.30
    fib.inputs["From Max"].default_value = 0.70
    fib.inputs["To Min"].default_value = 0.90
    fib.inputs["To Max"].default_value = 1.06
    nt.links.new(n_fino, fib.inputs["Value"])
    mult = N("ShaderNodeMix")
    mult.data_type = "RGBA"
    mult.blend_type = "MULTIPLY"
    mult.inputs[0].default_value = 1.0
    nt.links.new(rampa.outputs["Color"], mult.inputs[6])
    gris = N("ShaderNodeCombineColor")
    for k in ("Red", "Green", "Blue"):
        nt.links.new(fib.outputs[0], gris.inputs[k])
    nt.links.new(gris.outputs[0], mult.inputs[7])

    # manchas de umidade: só onde o ruído médio passa de um limiar, em cima da cor
    man = N("ShaderNodeMapRange")
    man.inputs["From Min"].default_value = 0.60 - 0.04 * forca
    man.inputs["From Max"].default_value = 0.70
    man.inputs["To Max"].default_value = 0.55 * forca * (0.0 if pal.get("sem_manchas") else 1.0)
    man.clamp = True
    nt.links.new(_ruido(nt, _vetor_periodico(nt, t, 7.0), 1.0, 4.0, 0.62, 0.0, semente=pal.get("semente", 1.0) + 17.0), man.inputs["Value"])
    cor_m = N("ShaderNodeRGB")
    cor_m.outputs[0].default_value = C.linear(pal["mancha"]) + (1.0,)
    fim = N("ShaderNodeMix")
    fim.data_type = "RGBA"
    fim.blend_type = "MIX"
    nt.links.new(man.outputs[0], fim.inputs[0])
    nt.links.new(mult.outputs[2], fim.inputs[6])
    nt.links.new(cor_m.outputs[0], fim.inputs[7])
    emi = N("ShaderNodeEmission")
    nt.links.new(fim.outputs[2], emi.inputs["Color"])
    sai = N("ShaderNodeOutputMaterial")
    nt.links.new(emi.outputs[0], sai.inputs["Surface"])
    return m


# ---- formas com volume ------------------------------------------------------------------------------------------------------------

def _centro_e_raio(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    return cx, cy, max(max(xs) - min(xs), max(ys) - min(ys)) / 2 or 1.0


def forma(pa, poly, escuro, medio, claro, tinta, contorno=0.40, borda=2.2, luz=(-0.55, -0.83), malha=1.1, hach=None, brilho=None, fundo_escuro=None):
    """Mancha com contorno de tinta e volume: o tom vem da luz (vinda de `luz`, no papel) e escurece perto da borda.

    `hach = dict(espaco, larg, cor, ang, forca)` acrescenta a hachura de sombra (a gravura). `brilho` acende a mancha no mapa de metal."""
    cx, cy, R = _centro_e_raio(poly)
    lx, ly = luz
    # `luz` aponta para a fonte de luz: o lado dela fica claro, o oposto fica escuro
    def tom(x, s):
        e = max(1.0 - distancia_ao_contorno((x, s), poly) / borda, 0.0) ** 1.3
        d = ((x - cx) * lx + (s - cy) * ly) / R   # 1 do lado da luz, -1 do lado da sombra
        v = 0.50 + 0.38 * d - 0.55 * e
        if v < 0.42:
            return mistura(escuro, medio, max(v, 0.0) / 0.42)
        return mistura(medio, claro, min((v - 0.42) / 0.45, 1.0))

    if contorno:
        pa.contorno(poly, tinta, contorno)
    pa.poli(poly, tom, malha=malha, brilho=brilho) if brilho is not None else pa.poli(poly, tom, malha=malha)
    if hach:
        def sombra(x, s, hach=hach):
            e = max(1.0 - distancia_ao_contorno((x, s), poly) / (borda * 1.6), 0.0)
            d = ((x - cx) * lx + (s - cy) * ly) / R
            return min(max(0.15 * e + 0.85 * max(-d * 0.9 + 0.1, 0.0) * (0.35 + 0.65 * e) * hach.get("forca", 1.0), 0.0), 1.0)
        hachurar(pa, poly, hach.get("ang", 0.7), hach.get("espaco", 0.9), hach.get("larg", 0.28), hach.get("cor", tinta), sombra=sombra, passo=1.0)
    return poly


# ---- ruído (variação de pintura nas manchas) -----------------------------------------------------------------------------------

def _hash(ix, iy, semente):
    v = math.sin(ix * 127.1 + iy * 311.7 + semente * 74.7) * 43758.5453
    return v - math.floor(v)


def ruido(x, s, escala=4.0, semente=0):
    """Ruído de valor suave em 0..1 (duas oitavas), com células de `escala` mm."""
    def uma(x, s, esc, sem):
        gx, gs = x / esc, s / esc
        ix, is_ = math.floor(gx), math.floor(gs)
        fx, fs = gx - ix, gs - is_
        fx, fs = fx * fx * (3 - 2 * fx), fs * fs * (3 - 2 * fs)
        a, b = _hash(ix, is_, sem), _hash(ix + 1, is_, sem)
        c, d = _hash(ix, is_ + 1, sem), _hash(ix + 1, is_ + 1, sem)
        return (a + (b - a) * fx) * (1 - fs) + (c + (d - c) * fx) * fs
    return 0.65 * uma(x, s, escala, semente) + 0.35 * uma(x, s, escala * 0.37, semente + 5)

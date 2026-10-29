"""Pequeno kit de geometria do boteco: triângulos com posição, normal e UV, em coordenadas do jogo (x ao longo da mesa, y para cima, z).

Pura (só numpy), roda dentro e fora do Blender. Toda forma recebe uma matriz 4x4 `T` (`mat`) e escreve numa `Malha`.
"""
import math

import numpy as np


def mat(pos=(0, 0, 0), yaw=0.0, rx=0.0, rz=0.0, s=1.0):
    """Matriz 4x4: escala, depois giro em x, z e y (graus; yaw em torno de +Y), depois posição."""
    ry, cx_, cz_ = math.radians(yaw), math.radians(rx), math.radians(rz)
    Rx = np.array([[1, 0, 0], [0, math.cos(cx_), -math.sin(cx_)], [0, math.sin(cx_), math.cos(cx_)]])
    Rz = np.array([[math.cos(cz_), -math.sin(cz_), 0], [math.sin(cz_), math.cos(cz_), 0], [0, 0, 1]])
    Ry = np.array([[math.cos(ry), 0, math.sin(ry)], [0, 1, 0], [-math.sin(ry), 0, math.cos(ry)]])
    M = np.eye(4)
    M[:3, :3] = Ry @ Rz @ Rx * s
    M[:3, 3] = pos
    return M


I4 = np.eye(4)


class Malha:
    """Triângulos soltos de um material."""

    def __init__(self, cena=None):
        self.cena = cena
        self.P, self.N, self.UV, self.F = [], [], [], []
        self.n = 0

    def add(self, T, P, N, UV, F):
        P = np.asarray(P, np.float64).reshape(-1, 3)
        N = np.asarray(N, np.float64).reshape(-1, 3)
        R = T[:3, :3]
        Pw = P @ R.T + T[:3, 3]
        Nw = N @ np.linalg.inv(R)   # normal: R^-T n, em linhas n^T R^-1
        Nw /= np.maximum(np.linalg.norm(Nw, axis=1, keepdims=True), 1e-12)
        self.P.append(Pw)
        self.N.append(Nw)
        self.UV.append(np.asarray(UV, np.float64).reshape(-1, 2))
        self.F.append(np.asarray(F, np.int64).reshape(-1, 3) + self.n)
        self.n += len(Pw)
        if self.cena is not None:
            self.cena._registrar(Pw)

    def triangulos(self):
        return sum(len(f) for f in self.F)

    def vazia(self):
        return self.n == 0

    def juntar(self):
        return (np.concatenate(self.P), np.concatenate(self.N), np.concatenate(self.UV), np.concatenate(self.F))


def _flat(T, m, verts, faces, uv_de):
    """Faces (listas de índices, 3 ou 4) com normal chapada; `uv_de(p, n)` dá o UV de cada vértice."""
    P, N, UV, F = [], [], [], []
    for f in faces:
        pts = np.array([verts[i] for i in f], np.float64)
        n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
        ln = np.linalg.norm(n)
        if ln < 1e-12:
            continue
        n /= ln
        base = len(P)
        for p in pts:
            P.append(p)
            N.append(n)
            UV.append(uv_de(p, n))
        for k in range(1, len(f) - 1):
            F.append((base, base + k, base + k + 1))
    if P:
        m.add(T, P, N, UV, F)


def _uv_caixa(esc, off=(0.0, 0.0)):
    def f(p, n):
        a = np.abs(n)
        if a[0] >= a[1] and a[0] >= a[2]:
            return ((p[2] + (0 if n[0] > 0 else 7.3)) * esc + off[0], p[1] * esc + off[1])
        if a[1] >= a[2]:
            return (p[0] * esc + off[0], (p[2] + (0 if n[1] > 0 else 3.1)) * esc + off[1])
        return ((p[0] + (0 if n[2] > 0 else 5.9)) * esc + off[0], p[1] * esc + off[1])
    return f


def caixa(m, T, tam, esc=1.0, off=(0.0, 0.0), sem=()):
    """Caixa centrada na origem local; `sem` lista faces a omitir (+x, -x, +y, -y, +z, -z). UV em escala de metro."""
    hx, hy, hz = tam[0] / 2, tam[1] / 2, tam[2] / 2
    v = {(sx, sy, sz): (sx * hx, sy * hy, sz * hz) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)}
    quads = {
        "+x": [(1, -1, -1), (1, 1, -1), (1, 1, 1), (1, -1, 1)],
        "-x": [(-1, -1, 1), (-1, 1, 1), (-1, 1, -1), (-1, -1, -1)],
        "+y": [(-1, 1, -1), (-1, 1, 1), (1, 1, 1), (1, 1, -1)],
        "-y": [(-1, -1, 1), (-1, -1, -1), (1, -1, -1), (1, -1, 1)],
        "+z": [(-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)],
        "-z": [(1, -1, -1), (-1, -1, -1), (-1, 1, -1), (1, 1, -1)],
    }
    verts, faces = [], []
    for nome, q in quads.items():
        if nome in sem:
            continue
        base = len(verts)
        verts += [v[k] for k in q]
        faces.append([base, base + 1, base + 2, base + 3])
    _flat(T, m, verts, faces, _uv_caixa(esc, off))


def caixa_chanfrada(m, T, tam, c, esc=1.0, off=(0.0, 0.0)):
    """Caixa com as arestas chanfradas (c = tamanho do chanfro): 6 faces, 12 faixas e 8 cantos."""
    h = np.array(tam, float) / 2
    c = min(c, *(h * 0.9))
    pt = {}
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                pt[(sx, sy, sz, 0)] = (sx * h[0], sy * (h[1] - c), sz * (h[2] - c))
                pt[(sx, sy, sz, 1)] = (sx * (h[0] - c), sy * h[1], sz * (h[2] - c))
                pt[(sx, sy, sz, 2)] = (sx * (h[0] - c), sy * (h[1] - c), sz * h[2])
    verts, idx = [], {}
    for k, p in pt.items():
        idx[k] = len(verts)
        verts.append(p)
    faces = []
    for eixo in range(3):
        for s in (-1, 1):
            quad = []
            outros = [a for a in range(3) if a != eixo]
            for (a, b) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                key = [0, 0, 0, eixo]
                key[eixo] = s
                key[outros[0]] = a
                key[outros[1]] = b
                quad.append(idx[tuple(key)])
            faces.append(quad if s > 0 and eixo != 1 or s < 0 and eixo == 1 else quad[::-1])
    for eixo in range(3):  # faixas ao longo de cada aresta paralela ao eixo
        outros = [a for a in range(3) if a != eixo]
        for sa in (-1, 1):
            for sb in (-1, 1):
                lado = []
                for t in (-1, 1):
                    k1, k2 = [0, 0, 0, outros[0]], [0, 0, 0, outros[1]]
                    for k in (k1, k2):
                        k[eixo] = t
                        k[outros[0]] = sa
                        k[outros[1]] = sb
                    lado.append((idx[tuple(k1)], idx[tuple(k2)]))
                faces.append([lado[0][0], lado[1][0], lado[1][1], lado[0][1]])
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                faces.append([idx[(sx, sy, sz, 0)], idx[(sx, sy, sz, 1)], idx[(sx, sy, sz, 2)]])
    # orienta cada face para fora (normal aponta para longe do centro)
    fixas = []
    for f in faces:
        pts = np.array([verts[i] for i in f])
        n = np.cross(pts[1] - pts[0], pts[2] - pts[0])
        if np.dot(n, pts.mean(axis=0)) < 0:
            f = f[::-1]
        fixas.append(f)
    _flat(T, m, verts, fixas, _uv_caixa(esc, off))


def quad(m, T, p0, p1, p2, p3, uv0, uv1, uv2, uv3):
    """Um retângulo (ou quadrilátero) em sentido anti-horário visto de frente; normal chapada."""
    P = np.array([p0, p1, p2, p3], float)
    n = np.cross(P[1] - P[0], P[2] - P[0])
    n /= np.linalg.norm(n)
    m.add(T, P, [n] * 4, [uv0, uv1, uv2, uv3], [(0, 1, 2), (0, 2, 3)])


def lathe(m, T, perfil, seg=12, esc_u=1.0, esc_v=1.0, arco=(0.0, 360.0), v0=0.0, u0=0.0):
    """Sólido de revolução em torno de +Y. `perfil` = [(r, y)] ou [(r, y, 'duro')] de baixo para cima; ponto 'duro' parte a normal.
    `arco` (graus) limita a volta (rótulo de garrafa). Normais suaves ao longo do perfil, UV = (volta, comprimento do perfil)."""
    pts = [(p[0], p[1], len(p) > 2 and p[2] == "duro") for p in perfil]
    nseg = len(pts) - 1
    segn = []
    for i in range(nseg):
        dr, dy = pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]
        L = math.hypot(dr, dy) or 1.0
        segn.append((dy / L, -dr / L))  # normal (radial, y)
    aneis = []  # (r, y, (nr, ny), id_do_ponto, comprimento)
    comp = [0.0]
    for i in range(nseg):
        comp.append(comp[-1] + math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]))
    for i, (r, y, duro) in enumerate(pts):
        if duro and 0 < i < nseg:
            aneis.append((r, y, segn[i - 1], i, comp[i]))
            aneis.append((r, y, segn[i], i, comp[i]))
        else:
            if 0 < i < nseg:
                a, b = segn[i - 1], segn[i]
                nr, ny = a[0] + b[0], a[1] + b[1]
                L = math.hypot(nr, ny) or 1.0
                nn = (nr / L, ny / L)
            else:
                nn = segn[min(i, nseg - 1)]
            aneis.append((r, y, nn, i, comp[i]))
    a0, a1 = math.radians(arco[0]), math.radians(arco[1])
    volta_completa = abs(arco[1] - arco[0]) >= 359.99
    P, N, UV, F = [], [], [], []
    col = seg + 1
    for (r, y, (nr, ny), pid, c) in aneis:
        for k in range(col):
            t = k / seg
            a = a0 + (a1 - a0) * t
            ca, sa = math.cos(a), math.sin(a)
            P.append((r * ca, y, r * sa))
            N.append((nr * ca, ny, nr * sa))
            UV.append((u0 + t * esc_u, v0 + c * esc_v))
    for i in range(len(aneis) - 1):
        if aneis[i][3] == aneis[i + 1][3]:
            continue
        r0, r1 = aneis[i][0], aneis[i + 1][0]
        for k in range(seg):
            a, b = i * col + k, i * col + k + 1
            c, d = (i + 1) * col + k, (i + 1) * col + k + 1
            if r0 < 1e-9 and r1 < 1e-9:
                continue
            if r0 < 1e-9:
                F.append((a, c, d))
            elif r1 < 1e-9:
                F.append((a, c, b))
            else:
                F.append((a, c, b))
                F.append((b, c, d))
    # orientação: (a, c, b) precisa apontar para fora; confere pelo primeiro triângulo e inverte tudo se preciso
    P_ = np.array(P)
    N_ = np.array(N)
    ok = 0
    for f in F[:40]:
        n = np.cross(P_[f[1]] - P_[f[0]], P_[f[2]] - P_[f[0]])
        ok += 1 if np.dot(n, N_[f[0]]) >= 0 else -1
    if ok < 0:
        F = [(f[0], f[2], f[1]) for f in F]
    m.add(T, P, N, UV, F)


def cilindro(m, T, r, h, seg=12, tampas=True, r_topo=None, esc=1.0):
    """Cilindro (ou tronco de cone) com a base em y = 0, topo em y = h."""
    rt = r if r_topo is None else r_topo
    perfil = ([(0, 0), (r, 0, "duro")] if tampas else [(r, 0)]) + ([(rt, h, "duro"), (0, h)] if tampas else [(rt, h)])
    lathe(m, T, perfil, seg, esc_u=2 * math.pi * r * esc, esc_v=esc)


def tubo(m, T, pontos, r, seg=8, fechado=False, tampas=True, esc=1.0):
    """Tubo de raio r varrendo a polilinha `pontos` (quinas suavizadas pelas normais compartilhadas). `r` pode ser uma lista (um raio por ponto): tubo afunilado."""
    pts = np.array(pontos, float)
    if fechado:
        pts = np.vstack([pts, pts[0]])
        if hasattr(r, "__len__"):
            r = list(r) + [r[0]]
    n = len(pts)
    tang = np.zeros_like(pts)
    for i in range(n):
        a = pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]
        if fechado and (i == 0 or i == n - 1):
            a = pts[1] - pts[-2]
        tang[i] = a / (np.linalg.norm(a) + 1e-12)
    ref = np.array([0.0, 1.0, 0.0]) if abs(tang[0][1]) < 0.9 else np.array([1.0, 0.0, 0.0])
    u = np.cross(tang[0], ref)
    u /= np.linalg.norm(u)
    P, N, UV, F = [], [], [], []
    comp = 0.0
    for i in range(n):
        if i:
            comp += np.linalg.norm(pts[i] - pts[i - 1])
            u = u - tang[i] * np.dot(u, tang[i])
            u /= np.linalg.norm(u) + 1e-12
        v = np.cross(tang[i], u)
        for k in range(seg + 1):
            a = 2 * math.pi * k / seg
            d = u * math.cos(a) + v * math.sin(a)
            P.append(pts[i] + d * (r[i] if hasattr(r, "__len__") else r))
            N.append(d)
            UV.append((k / seg, comp * esc))
    col = seg + 1
    for i in range(n - 1):
        for k in range(seg):
            a, b, c, d_ = i * col + k, i * col + k + 1, (i + 1) * col + k, (i + 1) * col + k + 1
            F += [(a, b, c), (b, d_, c)]
    ok = 0
    P_, N_ = np.array(P), np.array(N)
    for f in F[:30]:
        nn = np.cross(P_[f[1]] - P_[f[0]], P_[f[2]] - P_[f[0]])
        ok += 1 if np.dot(nn, N_[f[0]]) >= 0 else -1
    if ok < 0:
        F = [(f[0], f[2], f[1]) for f in F]
    m.add(T, P, N, UV, F)
    if tampas and not fechado:
        for i, sinal in ((0, -1), (n - 1, 1)):
            c = pts[i]
            nn = tang[i] * sinal
            base_i = i * col
            ring = P_[base_i:base_i + col]
            Pc = [c] + [p for p in ring[:seg]]
            Nc = [nn] * (seg + 1)
            UVc = [(0.5, 0.5)] + [(0.5 + 0.5 * math.cos(2 * math.pi * k / seg), 0.5 + 0.5 * math.sin(2 * math.pi * k / seg)) for k in range(seg)]
            Fc = []
            for k in range(seg):
                tri = (0, 1 + k, 1 + (k + 1) % seg)
                Fc.append(tri if sinal > 0 else (tri[0], tri[2], tri[1]))
            # confere o sentido pela normal
            t0 = Fc[0]
            if np.dot(np.cross(np.array(Pc[t0[1]]) - np.array(Pc[t0[0]]), np.array(Pc[t0[2]]) - np.array(Pc[t0[0]])), nn) < 0:
                Fc = [(f[0], f[2], f[1]) for f in Fc]
            m.add(T, Pc, Nc, UVc, Fc)


def anel(cx, cy, cz, r, n=24, plano="xz"):
    """Pontos de um círculo (para `tubo(..., fechado=True)`)."""
    pts = []
    for k in range(n):
        a = 2 * math.pi * k / n
        if plano == "xz":
            pts.append((cx + r * math.cos(a), cy, cz + r * math.sin(a)))
        elif plano == "xy":
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a), cz))
        else:
            pts.append((cx, cy + r * math.cos(a), cz + r * math.sin(a)))
    return pts


def disco(m, T, r, seg, uv_centro, uv_raio, y=0.0):
    """Disco plano no plano local XZ (normal +Y) com UV planar (para um relógio, por exemplo); aponte-o com `T`."""
    P, N, UV, F = [(0, y, 0)], [(0, 1, 0)], [uv_centro], []
    for k in range(seg):
        a = 2 * math.pi * k / seg
        P.append((r * math.cos(a), y, r * math.sin(a)))
        N.append((0, 1, 0))
        UV.append((uv_centro[0] + uv_raio * math.cos(a), uv_centro[1] - uv_raio * math.sin(a)))
    for k in range(seg):
        F.append((0, 1 + (k + 1) % seg, 1 + k))
    m.add(T, P, N, UV, F)


# ------------------------------------------------------------------ P6: superfícies suaves (cantos arredondados, lajes, remendos curvos, splines)
def normais_suaves(P, F):
    """Normais por vértice (média ponderada pela área das faces), soldando os vértices que ficam no mesmo ponto (a costura da UV não vira quina)."""
    P = np.asarray(P, np.float64)
    F = np.asarray(F, np.int64)
    fn = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    chave = np.round(P * 1e6).astype(np.int64)
    _, ident = np.unique(chave, axis=0, return_inverse=True)
    ident = ident.ravel()
    acum = np.zeros((ident.max() + 1, 3))
    for k in range(3):
        np.add.at(acum, ident[F[:, k]], fn)
    N = acum[ident]
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)


def malha_suave(m, T, P, F, UV):
    """Escreve triângulos com normais suaves calculadas da própria geometria."""
    P = np.asarray(P, np.float64)
    m.add(T, P, normais_suaves(P, F), UV, F)


def spline(pontos, n=6, cerrado=False):
    """Catmull-Rom centrípeta por `pontos` (3D ou 2D); `n` amostras por trecho. Passa por todos os pontos."""
    P = np.asarray(pontos, float)
    if cerrado:
        P = np.vstack([P[-1], P, P[0], P[1]])
    else:
        P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    saida = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        t0 = 0.0
        t1 = t0 + max(np.linalg.norm(p1 - p0), 1e-9) ** 0.5
        t2 = t1 + max(np.linalg.norm(p2 - p1), 1e-9) ** 0.5
        t3 = t2 + max(np.linalg.norm(p3 - p2), 1e-9) ** 0.5
        for t in np.linspace(t1, t2, n, endpoint=False):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            saida.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    if not cerrado:
        saida.append(np.asarray(pontos, float)[-1])
    return [tuple(p) for p in saida]


def perfil_suave(pontos, n=5):
    """Perfil de torno (r, y[, 'duro']) suavizado por spline entre os pontos 'duros' (que ficam como quinas): para garrafas, copos e vasos."""
    pts = [(float(p[0]), float(p[1]), len(p) > 2 and p[2] == "duro") for p in pontos]
    cortes = [0] + [i for i, p in enumerate(pts) if p[2] and 0 < i < len(pts) - 1] + [len(pts) - 1]
    saida = []
    for a, b in zip(cortes[:-1], cortes[1:]):
        trecho = [(p[0], p[1]) for p in pts[a:b + 1]]
        dense = spline(trecho, n) if len(trecho) > 2 else trecho
        if saida:   # o ponto de junção já está na saída: vira a quina
            saida[-1] = (saida[-1][0], saida[-1][1], "duro")
            dense = dense[1:]
        saida += [(max(float(p[0]), 0.0), float(p[1])) for p in dense]
    return saida


def superficie(m, T, fn, nu, nv, uv_esc=(1.0, 1.0), inverter=False):
    """Remendo paramétrico: `fn(u, v)` (u, v em 0..1) dá o ponto; normais suaves da própria geometria. UV = (u, v) x `uv_esc`."""
    P, UV = [], []
    for j in range(nv + 1):
        for i in range(nu + 1):
            u, v = i / nu, j / nv
            P.append(fn(u, v))
            UV.append((u * uv_esc[0], v * uv_esc[1]))
    F = []
    col = nu + 1
    for j in range(nv):
        for i in range(nu):
            a, b, c, d = j * col + i, j * col + i + 1, (j + 1) * col + i, (j + 1) * col + i + 1
            F += [(a, c, b), (b, c, d)] if inverter else [(a, b, c), (b, d, c)]
    malha_suave(m, T, P, F, UV)


def orientada(m, T, fn, nu, nv, ref, fora=True, uv_esc=(1.0, 1.0), decalque=False):
    """`superficie` com a normal virada para fora (ou para dentro) do ponto `ref`: o sentido da malha sai da própria geometria, sem chute (calha, tampo, casca).
    `decalque`: com a normal errada, em vez de virar a malha (o que espelharia a textura) inverte o `u`: o texto sai certo para quem olha de fora."""
    ref = np.asarray(ref, float)
    pts = np.array([[fn(i / nu, j / nv) for i in range(nu + 1)] for j in range(nv + 1)], float)
    soma = 0.0
    for j in range(nv):
        for i in range(nu):
            a, b, c_ = pts[j, i], pts[j, i + 1], pts[j + 1, i]
            soma += float(np.cross(b - a, c_ - a) @ (a - ref))
    errada = (soma < 0) == fora
    if decalque and errada:
        superficie(m, T, lambda u, v: fn(1.0 - u, v), nu, nv, uv_esc)
    else:
        superficie(m, T, fn, nu, nv, uv_esc, inverter=errada)


def caixa_redonda(m, T, tam, r, k=3, esc=1.0, off=(0.0, 0.0)):
    """Caixa de cantos e arestas arredondados (raio `r`, `k` pontos por quina): normais suaves, UV como a de `caixa`. Bom para eletrodomésticos, caixas e plásticos."""
    H = np.array(tam, float) / 2
    r = float(min(r, *(H * 0.98)))
    ang = np.radians(np.linspace(45.0, 0.0, k))
    ts = np.tan(ang)
    P, N, UV, F = [], [], [], []
    uvf = _uv_caixa(esc, off)
    for a in range(3):
        u, v = [b for b in range(3) if b != a]
        for s in (-1, 1):
            cu = np.concatenate([-(H[u] - r + r * ts), (H[u] - r + r * ts[::-1])])
            cv = np.concatenate([-(H[v] - r + r * ts), (H[v] - r + r * ts[::-1])])
            base = len(P)
            for y in cv:
                for x in cu:
                    po = np.zeros(3)
                    po[a], po[u], po[v] = s * H[a], x, y
                    q = np.clip(po, -(H - r), H - r)
                    n = po - q
                    n /= np.linalg.norm(n)
                    p = q + n * r
                    P.append(p)
                    N.append(n)
                    UV.append(uvf(p, n))
            nc = len(cu)
            for j in range(len(cv) - 1):
                for i in range(nc - 1):
                    p0, p1, p2, p3 = base + j * nc + i, base + j * nc + i + 1, base + (j + 1) * nc + i, base + (j + 1) * nc + i + 1
                    F += [(p0, p1, p2), (p1, p3, p2)]
    P, N = np.array(P), np.array(N)
    F = np.array(F)
    t = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    ruim = (t * N[F[:, 0]]).sum(axis=1) < 0
    F[ruim] = F[ruim][:, [0, 2, 1]]
    m.add(T, P, N, UV, F)


def aneis_retangulo(w, d, rc, n=5, ns=0):
    """Pontos (x, z) de um retângulo de cantos arredondados (anti-horário visto de cima), 4*(n+1+ns) pontos: `ns` pontos a mais em cada lado reto (para a laje entortada
    seguir a curva em vez de uma corda)."""
    rc = max(min(rc, w / 2 - 1e-4, d / 2 - 1e-4), 1e-4)
    arcos = []
    for cx, cz, a0 in ((w / 2 - rc, d / 2 - rc, 0), (-w / 2 + rc, d / 2 - rc, 90), (-w / 2 + rc, -d / 2 + rc, 180), (w / 2 - rc, -d / 2 + rc, 270)):
        arcos.append([(cx + rc * math.cos(math.radians(a0 + 90 * i / n)), cz + rc * math.sin(math.radians(a0 + 90 * i / n))) for i in range(n + 1)])
    pts = []
    for k, arco in enumerate(arcos):
        pts += arco
        a, b = arco[-1], arcos[(k + 1) % 4][0]
        pts += [(a[0] + (b[0] - a[0]) * (j + 1) / (ns + 1), a[1] + (b[1] - a[1]) * (j + 1) / (ns + 1)) for j in range(ns)]
    return pts


def laje(m, T, w, d, h, rc=0.05, rb=0.01, n_c=5, n_b=3, deformar=None, esc=1.0, interior=0, ns=0):
    """Laje de contorno retangular arredondado (`w` em x, `d` em z, espessura `h` em y, centrada), com a borda filetada (raio `rb`): tampo, assento, encosto, bandeja.
    `deformar(P) -> P` (n,3) entorta a laje (concavidade do assento, curva do encosto) antes das normais. `interior`: anéis a mais nas faces (para o `deformar` agir);
    `ns`: pontos a mais nos lados retos de cada anel (sem eles a borda reta vira uma corda e o entortado some)."""
    rb = min(rb, h / 2 * 0.98, min(w, d) / 2 * 0.5)
    perfil = []   # (recuo, y) de baixo para cima
    for t in np.linspace(90, 0, n_b + 1):
        perfil.append((rb * (1 - math.cos(math.radians(t))), -h / 2 + rb - rb * math.sin(math.radians(t))))
    for t in np.linspace(0, 90, n_b + 1):
        perfil.append((rb * (1 - math.cos(math.radians(t))), h / 2 - rb + rb * math.sin(math.radians(t))))
    base_extra = [(rb + (min(w, d) / 2 - rb) * (i + 1) / (interior + 1) * 0.92, -h / 2) for i in range(interior)]
    topo_extra = [(rb + (min(w, d) / 2 - rb) * (i + 1) / (interior + 1) * 0.92, h / 2) for i in range(interior)]
    perfil = base_extra[::-1] + perfil + topo_extra
    P, F = [], []
    ncol = 4 * (n_c + 1 + ns)
    for rec, y in perfil:
        for (x, z) in aneis_retangulo(w - 2 * rec, d - 2 * rec, rc - rec, n_c, ns):
            P.append((x, y, z))
    P = np.array(P)
    nl = len(perfil)
    for j in range(nl - 1):
        for i in range(ncol):
            a, b = j * ncol + i, j * ncol + (i + 1) % ncol
            c_, d_ = (j + 1) * ncol + i, (j + 1) * ncol + (i + 1) % ncol
            F += [(a, c_, b), (b, c_, d_)]
    ci = len(P)
    P = np.vstack([P, [(0, -h / 2, 0), (0, h / 2, 0)]])
    for i in range(ncol):
        a, b = i, (i + 1) % ncol
        F.append((ci, a, b))
        a2, b2 = (nl - 1) * ncol + i, (nl - 1) * ncol + (i + 1) % ncol
        F.append((ci + 1, b2, a2))
    F = np.array(F)
    if deformar is not None:
        P = deformar(P)
    t = np.cross(P[F[:, 1]] - P[F[:, 0]], P[F[:, 2]] - P[F[:, 0]])
    c0 = P.mean(axis=0)
    if (t * (P[F[:, 0]] - c0)).sum() < 0:
        F = F[:, [0, 2, 1]]
    N = normais_suaves(P, F)
    uvf = _uv_caixa(esc)
    UV = [uvf(p, n) for p, n in zip(P, N)]
    m.add(T, P, N, UV, F)

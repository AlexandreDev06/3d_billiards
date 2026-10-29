"""O construtor de malhas dos chapéus (numpy puro, sem bpy): superfícies de revolução, tubos, esferas e placas, tudo em centímetros.

Coordenadas do chapéu (as mesmas do Blender; o exportador as vira Y-up): a origem é o ponto do alto da cabeça que encosta na `ancora_chapeu`, +Z sobe (vira +Y no glTF) e a frente do rosto
é -Y (vira +Z). O ângulo `theta` conta da frente: x = r sen(theta), y = -r cos(theta). A orientação é anti-horária vista de fora (a normal sai da superfície); as malhas são de um lado só,
então as peças finas (aba, cinta) levam as duas faces e a borda.
"""
import math

import numpy as np


def pol(r, z, theta):
    """(r, z, theta) -> (x, y, z): theta = 0 é a frente (-Y); +90 graus é o lado +X."""
    return np.stack([r * np.sin(theta), -r * np.cos(theta), z + 0 * r], axis=-1)


class Malha:
    """Vértices (V), faces (F: tuplas de índices), a UV de cada canto de cada face (UVF) e o índice do material de cada face (M).
    Cada chamada cria vértices próprios (as bordas entre peças ficam duras); dentro de uma peça os vértices são compartilhados (a sombra é suave, sem costura)."""

    def __init__(self):
        self.V, self.F, self.UVF, self.M = [], [], [], []
        self.nomes = []                # os materiais, na ordem de uso: `mat(nome)` devolve o índice

    def mat(self, nome):
        if nome not in self.nomes:
            self.nomes.append(nome)
        return self.nomes.index(nome)

    def _v(self, p):
        self.V.append(np.asarray(p, float))
        return len(self.V) - 1

    def _face(self, f, mat, uvs=None):
        f = list(f)
        uvs = list(uvs) if uvs is not None else [(0.5, 0.5)] * len(f)
        # tira cantos repetidos (o polo de uma revolução é um vértice só): o quadrilátero vira triângulo
        for k in range(len(f)):
            if f[k] == f[(k + 1) % len(f)]:
                f.pop(k)
                uvs.pop(k)
                break
        if len(f) < 3:
            return
        self.F.append(tuple(f))
        self.UVF.append(tuple(uvs))
        self.M.append(mat)

    def grade(self, P, mat, fechada=True, uv=None, inverter=False):
        """Uma grade de pontos P (linhas, colunas, 3): as linhas sobem, as colunas giram (fechada: a última coluna volta à primeira). Cria os quadriláteros."""
        P = np.asarray(P, float)
        nl, nc = P.shape[:2]
        ncol = nc + 1 if fechada else nc
        idx = np.zeros((nl, nc), dtype=int)
        for i in range(nl):
            if np.allclose(P[i], P[i, 0], atol=1e-9):          # uma linha de pontos iguais (o polo) é um vértice só
                idx[i, :] = self._v(P[i, 0])
            else:
                for j in range(nc):
                    idx[i, j] = self._v(P[i, j])
        for i in range(nl - 1):
            for j in range(ncol - 1):
                j2 = (j + 1) % nc
                a, b, c, d = int(idx[i, j]), int(idx[i, j2]), int(idx[i + 1, j2]), int(idx[i + 1, j])
                ua = (uv(i, j, nl, ncol) if uv else (j / (ncol - 1), i / max(nl - 1, 1)))
                ub = (uv(i, j + 1, nl, ncol) if uv else ((j + 1) / (ncol - 1), i / max(nl - 1, 1)))
                uc = (uv(i + 1, j + 1, nl, ncol) if uv else ((j + 1) / (ncol - 1), (i + 1) / max(nl - 1, 1)))
                ud = (uv(i + 1, j, nl, ncol) if uv else (j / (ncol - 1), (i + 1) / max(nl - 1, 1)))
                if inverter:
                    self._face((d, c, b, a), mat, (ud, uc, ub, ua))
                else:
                    self._face((a, b, c, d), mat, (ua, ub, uc, ud))
        return idx

    def revolucao(self, perfil, n, mat, deformar=None, repeticao=(4.0, 1.0), fase=0.0, inverter=False):
        """Superfície de revolução: `perfil` é uma lista de (r, z) de baixo para cima (fora da peça); `deformar(r, z, theta) -> (r, z)` altera cada ponto (aba caída, vinco etc.)."""
        th = fase + 2 * math.pi * np.arange(n) / n
        P = np.zeros((len(perfil), n, 3))
        for i, (r, z) in enumerate(perfil):
            rr, zz = np.full(n, float(r)), np.full(n, float(z))
            if deformar is not None:
                rz = [deformar(r, z, t) for t in th]
                rr, zz = np.array([a for a, _ in rz]), np.array([b for _, b in rz])
            P[i] = pol(rr, zz, th)
        return self.grade(P, mat, True, uv=lambda i, j, nl, nc: (repeticao[0] * j / (nc - 1), repeticao[1] * i / max(nl - 1, 1)), inverter=inverter)

    def tampa(self, r, z, n, mat, rz=None, repeticao=1.0, voltada_para_cima=True, deformar=None):
        """Um disco (leque de triângulos em anéis) em z, de raio r; `rz` = (r_anel_1, ...) opcionais; `deformar(x, y) -> z` dá relevo."""
        aneis = rz or [r * 0.5]
        perfil = [(0.0, z)] + [(a, z) for a in aneis] + [(r, z)]
        th = 2 * math.pi * np.arange(n) / n
        P = np.zeros((len(perfil), n, 3))
        for i, (rr, zz) in enumerate(perfil):
            p = pol(np.full(n, rr), np.full(n, zz), th)
            if deformar is not None:
                p[:, 2] = [deformar(x, y) for x, y in zip(p[:, 0], p[:, 1])]
            P[i] = p
        self.grade(P, mat, True, uv=lambda i, j, nl, nc: (0.5 + 0.5 * repeticao * (i / (nl - 1)) * math.sin(2 * math.pi * j / (nc - 1)), 0.5 - 0.5 * repeticao * (i / (nl - 1)) * math.cos(2 * math.pi * j / (nc - 1))),
                   inverter=not voltada_para_cima)

    def esfera(self, centro, raio, mat, n=16, m=10, escala=(1.0, 1.0, 1.0), ruido=None):
        """Uma esfera (ou elipsoide). `ruido(x, y, z) -> fator` deforma o raio (pompom fofo)."""
        cx, cy, cz = centro
        P = np.zeros((m + 1, n, 3))
        for i in range(m + 1):
            ph = -math.pi / 2 + math.pi * i / m
            for j in range(n):
                t = 2 * math.pi * j / n
                d = np.array([math.cos(ph) * math.sin(t), -math.cos(ph) * math.cos(t), math.sin(ph)])
                f = 1.0 if ruido is None else ruido(*d)
                P[i, j] = np.array([cx + raio * f * escala[0] * d[0], cy + raio * f * escala[1] * d[1], cz + raio * f * escala[2] * d[2]])
        self.grade(P, mat, True)

    def tubo(self, pontos, raio, mat, n=6, fechar_pontas=True, raios=None):
        """Um tubo por uma linha de pontos (raio constante ou `raios` por ponto)."""
        pontos = np.asarray(pontos, float)
        P = np.zeros((len(pontos), n, 3))
        for i, p in enumerate(pontos):
            a = pontos[min(i + 1, len(pontos) - 1)] - pontos[max(i - 1, 0)]
            a = a / np.linalg.norm(a)
            ref = np.array([0.0, 0.0, 1.0]) if abs(a[2]) < 0.9 else np.array([1.0, 0.0, 0.0])
            u = np.cross(a, ref)
            u /= np.linalg.norm(u)
            w = np.cross(a, u)
            r = raio if raios is None else raios[i]
            for j in range(n):
                t = 2 * math.pi * j / n
                P[i, j] = p + r * (math.cos(t) * u + math.sin(t) * w)
        self.grade(P, mat, True)
        if fechar_pontas:
            for i, ordem in ((0, 1), (len(pontos) - 1, 0)):
                ids = [self._v(P[i, j]) for j in range(n)]
                centro = self._v(pontos[i])
                for j in range(n):
                    a, b = ids[j], ids[(j + 1) % n]
                    self._face((a, b, centro) if ordem == 0 else (b, a, centro), mat)

    def triangulos(self):
        return sum(len(f) - 2 for f in self.F)

    def normalizar_faces_para_fora(self, centro=(0.0, 0.0, 0.0)):
        """Confere (sem consertar) quantas faces apontam para dentro do centro dado: serve para provas rápidas."""
        V = np.array(self.V)
        dentro = 0
        for f in self.F:
            n = np.cross(V[f[1]] - V[f[0]], V[f[2]] - V[f[0]])
            c = V[list(f)].mean(axis=0) - np.array(centro)
            if np.dot(n, c) < 0:
                dentro += 1
        return dentro

    def girar(self, eixo, graus, centro=(0.0, 0.0, 0.0)):
        """Gira todos os vértices em volta de `eixo` (0 = x, 1 = y, 2 = z) por `graus`, passando por `centro`."""
        a = math.radians(graus)
        c, s = math.cos(a), math.sin(a)
        i, j = [(1, 2), (2, 0), (0, 1)][eixo]
        V = np.array(self.V) - np.array(centro)
        V2 = V.copy()
        V2[:, i] = V[:, i] * c - V[:, j] * s
        V2[:, j] = V[:, i] * s + V[:, j] * c
        self.V = [v + np.array(centro) for v in V2]

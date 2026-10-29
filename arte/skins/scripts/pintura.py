"""Pincéis: degradês, luzes e folhas, em cima de `Tela.poligono` e `desenho`."""
import math

import cor as C
import desenho as D


def _mix(a, b, t):
    n = max(len(a), len(b))
    a = tuple(a) + (1.0,) * (n - len(a))
    b = tuple(b) + (1.0,) * (n - len(b))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(n))


def lin(p0, p1, c0, c1):
    """Degradê linear de p0 (cor c0) a p1 (cor c1); fora do segmento fica na cor da ponta."""
    dx, dy = p1[0] - p0[0], p1[1] - p0[1]
    l2 = dx * dx + dy * dy or 1.0

    def f(x, y):
        t = ((x - p0[0]) * dx + (y - p0[1]) * dy) / l2
        return _mix(c0, c1, min(max(t, 0.0), 1.0))
    return f


def radial(centro, r, c_in, c_out, forma=1.0, rx=None, ry=None):
    """Degradê radial (elíptico se `rx`/`ry`): c_in no centro, c_out a r de distância. `forma` > 1 concentra o c_in no meio."""
    rx = r if rx is None else rx
    ry = r if ry is None else ry

    def f(x, y):
        d = math.hypot((x - centro[0]) / rx, (y - centro[1]) / ry)
        return _mix(c_in, c_out, min(d, 1.0) ** forma)
    return f


def luz(t, centro, raio, cor_, forca=1.0, brilho=None, gama=2.2, malha=2.0, ry=None, rot=0.0):
    """Um clarão macio: alfa de `forca` no centro até 0 na borda (`gama` > 1 fecha o miolo)."""
    ry = raio if ry is None else ry

    def f(x, y):
        dx, dy = x - centro[0], y - centro[1]
        c, s = math.cos(-rot), math.sin(-rot)
        d = math.hypot((dx * c - dy * s) / raio, (dx * s + dy * c) / ry)
        a = forca * max(1.0 - d, 0.0) ** gama
        return tuple(cor_[:3]) + (a,)

    def g(x, y):
        v = f(x, y)
        b = brilho if brilho is not None else (0, 0, 0)
        return tuple(b[:3]) + (v[3],)
    t.poligono(D.elipse(centro[0], centro[1], raio, ry, rot=rot, n=max(24, int(raio * 3))), f, brilho=g if brilho is not None else None, alfa=True, malha=malha, centro=centro)


def forma_de_folha(w, l, barriga=0.45, ponta=0.0):
    """Folha/pena apontada para -y (a base na origem, a ponta em (0, -l)): usada nas penas, que apontam para baixo."""
    pts = [(0.0, 0.0), (0.45 * w, -0.18 * l), (0.5 * w, -barriga * l), (0.34 * w, -0.8 * l), (0.0, -l), (-0.34 * w, -0.8 * l), (-0.5 * w, -barriga * l), (-0.45 * w, -0.18 * l)]
    return D.suave(pts, True, 3)


def encher(t, pts, c, contorno=None, larg_contorno=0.3, **kw):
    """Preenche `pts`, com um contorno escuro por baixo se pedir."""
    if contorno is not None:
        t.poligono(D.expandir(pts, larg_contorno), contorno, **kw_sem_brilho(kw))
    t.poligono(pts, c, **kw)


def kw_sem_brilho(kw):
    return {k: v for k, v in kw.items() if k not in ("brilho", "brilho_centro")}

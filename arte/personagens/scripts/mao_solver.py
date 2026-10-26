"""Mínimos quadrados amortecidos (Levenberg–Marquardt) com Jacobiano numérico, só com numpy.

Serve para achar os ângulos das poses que dependem de contato (ponte, punho, pinça) medindo a malha de verdade.
"""
import numpy as np


class Param:
    """Um número livre: onde mora (osso e eixo, ou algo do taco/cubo), limites, valor inicial e o preferido."""

    def __init__(self, nome, lo, hi, inicio, pref=None, peso=0.0, passo=0.5):
        self.nome, self.lo, self.hi = nome, lo, hi
        self.inicio = inicio
        self.pref = inicio if pref is None else pref
        self.peso = peso
        self.passo = passo


def resolver(parametros, residuos, iteracoes=40, verboso=True, tol=1e-4):
    """Minimiza |residuos(x)|² com x limitado. `residuos` devolve um array 1-D. Devolve (x, custo)."""
    lo = np.array([p.lo for p in parametros], dtype=float)
    hi = np.array([p.hi for p in parametros], dtype=float)
    x = np.clip(np.array([p.inicio for p in parametros], dtype=float), lo, hi)
    pref = np.array([p.pref for p in parametros], dtype=float)
    peso = np.array([p.peso for p in parametros], dtype=float)
    passo = np.array([p.passo for p in parametros], dtype=float)

    def f(v):
        return np.concatenate([residuos(v), peso * (v - pref)])

    r = f(x)
    custo = float(r @ r)
    lam = 1.0
    for it in range(iteracoes):
        J = np.empty((len(r), len(x)))
        for k in range(len(x)):
            h = passo[k] if x[k] + passo[k] <= hi[k] else -passo[k]
            xk = x.copy()
            xk[k] += h
            J[:, k] = (f(xk) - r) / h
        A, g = J.T @ J, J.T @ r
        melhorou = False
        for _ in range(12):
            try:
                dx = -np.linalg.solve(A + lam * np.diag(np.diag(A) + 1e-6), g)
            except np.linalg.LinAlgError:
                lam *= 10
                continue
            xn = np.clip(x + dx, lo, hi)
            rn = f(xn)
            cn = float(rn @ rn)
            if cn < custo:
                melhoria = custo - cn
                x, r, custo = xn, rn, cn
                lam = max(lam / 3, 1e-5)
                melhorou = True
                break
            lam *= 4
        if verboso:
            print("  iter", it, "custo", round(custo, 3), "lam", "%.1e" % lam)
        if not melhorou or melhoria < tol:
            break
    return x, custo

"""Pequena biblioteca de animação da mão, em Python puro (sem bpy): curvas suaves, atraso entre ossos e mola.

Uma animação é escrita pelo que se vê: poses-chave (as mesmas de `mao_poses.py`, graus por osso) em quadros a 30/s, e daí saem
os quadros densos (um por quadro, para o `04_poses.py` gravar):

* `curva`: cada canal passa pelas chaves com uma cúbica monótona (Fritsch–Carlson): acelera e freia, não passa do valor das
  chaves entre elas e começa e termina com velocidade zero; nada linear.
* `atraso`: cada osso lê a curva um pouco depois do anterior (palma, depois dedos, depois pontas): é a sobreposição.
* `mola`: um filtro de segunda ordem faz o osso perseguir a curva e passar um pouco do alvo (follow-through) e assentar.
* `vida`: uma oscilação mínima que cresce no fim, para o gesto não terminar como estátua.

`pulso.loc` é em cm no referencial do osso (x e z de sinal trocado em relação à mão: z positivo desce); `mover(x, y, z)` escreve
o mesmo deslocamento no referencial da mão (x para o mínimo, y para os dedos, z para o dorso).
"""
import math

FPS = 30


def mover(x=0.0, y=0.0, z=0.0):
    """Deslocamento do pulso no referencial da mão (cm) → o `loc` do osso (cm)."""
    return (-x, y, -z)


def curva(chaves):
    """Função t → valor que passa pelas chaves `(t, v)` ou `(t, v, True)` (o terceiro valor trava a velocidade em zero ali)."""
    ts = [c[0] for c in chaves]
    vs = [float(c[1]) for c in chaves]
    trava = [len(c) > 2 and bool(c[2]) for c in chaves]
    n = len(ts)
    if n == 1:
        return lambda t: vs[0]
    h = [ts[i + 1] - ts[i] for i in range(n - 1)]
    d = [(vs[i + 1] - vs[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    for i in range(1, n - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    for i, t in enumerate(trava):
        if t:
            m[i] = 0.0

    def f(t):
        if t <= ts[0]:
            return vs[0]
        if t >= ts[-1]:
            return vs[-1]
        i = 0
        while ts[i + 1] < t:
            i += 1
        s = (t - ts[i]) / h[i]
        s2, s3 = s * s, s * s * s
        return ((2 * s3 - 3 * s2 + 1) * vs[i] + (s3 - 2 * s2 + s) * h[i] * m[i]
                + (-2 * s3 + 3 * s2) * vs[i + 1] + (s3 - s2) * h[i] * m[i + 1])

    return f


def mola(alvo, quadros, omega, zeta, sub=8):
    """O valor `x` de uma mola que persegue `alvo(t)` (t em quadros): x'' = ω²(alvo − x) − 2ζω x'. Devolve `x` em cada quadro inteiro."""
    dt = 1.0 / FPS / sub
    w = omega
    x, v = alvo(0.0), 0.0
    saida = [x]
    for q in range(1, quadros + 1):
        for k in range(sub):
            t = (q - 1) + (k + 1) / sub
            a = w * w * (alvo(t) - x) - 2 * zeta * w * v
            v += a * dt
            x += v * dt
        saida.append(x)
    return saida


def categoria(osso):
    """'pulso', 'palma', 'prox' (1º osso do dedo), 'meio', 'dist' ou 'polegar_1..3'."""
    if osso in ("pulso", "palma"):
        return osso
    if osso.startswith("polegar"):
        return osso
    return {"1": "prox", "2": "meio", "3": "dist"}[osso[-1]]


def canais(quadros):
    """{(osso, eixo): [(t, v, trava)]} a partir de `[(t, pose, trava?)]`; osso ausente numa chave vale zero (o neutro do esqueleto)."""
    ossos = set()
    for q in quadros:
        ossos.update(o for o in q[1] if o != "loc")
    saida = {}
    for o in ossos:
        for e in range(3):
            saida[(o, e)] = [(q[0], q[1].get(o, (0.0, 0.0, 0.0))[e], len(q) > 2 and q[2]) for q in quadros]
    if any("loc" in q[1] for q in quadros):
        for e in range(3):
            saida[("loc", e)] = [(q[0], q[1].get("loc", (0.0, 0.0, 0.0))[e], len(q) > 2 and q[2]) for q in quadros]
    return saida


def construir(quadros, duracao, atraso=None, molas=None, vida=None, trava=None):
    """Quadros densos `[(quadro, pose)]` de 0 a `duracao`.

    `atraso`: {categoria: quadros} (a curva do osso é lida `atraso` quadros depois); `molas`: {categoria: (ω, ζ)};
    `vida`: lista de `(osso, eixo, amplitude_graus, período_em_quadros, fase)` somada com envelope crescente no último terço;
    `trava`: não usado (as chaves levam o próprio `True`).
    """
    atraso = atraso or {}
    molas = molas or {}
    amostras = {}
    for (osso, e), chaves in canais(quadros).items():
        base = curva(chaves)
        cat = "pulso" if osso == "loc" else categoria(osso)
        d = atraso.get(cat, atraso.get(cat.split("_")[0], 0.0))
        f = (lambda t, base=base, d=d: base(t - d))
        if cat in molas:
            vals = mola(f, duracao, *molas[cat])
        else:
            vals = [f(float(q)) for q in range(duracao + 1)]
        amostras[(osso, e)] = vals
    for osso, e, amp, per, fase in (vida or []):
        vals = amostras.setdefault((osso, e), [0.0] * (duracao + 1))
        for q in range(duracao + 1):
            env = max(0.0, (q - duracao * 0.55) / (duracao * 0.45))
            vals[q] += amp * env * env * (3 - 2 * env) * math.sin(2 * math.pi * (q / per + fase))
    densos = []
    for q in range(duracao + 1):
        pose = {}
        for (osso, e), vals in amostras.items():
            if osso == "loc":
                pose.setdefault("loc", [0.0, 0.0, 0.0])[e] = vals[q]
            else:
                pose.setdefault(osso, [0.0, 0.0, 0.0])[e] = vals[q]
        densos.append((q, {k: tuple(v) for k, v in pose.items()}))
    return densos


def ciclo(quadros, duracao, atraso=None, molas=None):
    """Como `construir`, mas o último quadro repete o primeiro por construção: as chaves já fecham o ciclo."""
    return construir(quadros, duracao, atraso, molas)

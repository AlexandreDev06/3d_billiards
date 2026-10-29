"""Junta as passes assadas do Blender (cor, luz, oclusão, marcas) no atlas JPEG do nível (P5).

    uv run --with numpy --with pillow --with scipy python3 compor.py trabalho/<nivel> <nivel> [--previa]

radiância = cor x luz x oclusão (+ cor x marcas, o que já nasce aceso). O jogo mostra a textura sem luz (KHR_materials_unlit) mas ainda passa pelo
tone mapping ACESFilmic (exposição 1), então a imagem é gravada de forma que ACES(textura) caia no tom desejado: a exposição `k` é achada pelo percentil 99 da luminância
e o tom é invertido por iteração contra uma réplica numpy do ACES do three (divide a entrada por 0,6, matrizes de entrada e saída e o ajuste RRT+ODT).
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

# por nível: sigma do borrão da luz (px no tamanho da luz), qualidade do JPEG, lado final do atlas, força da oclusão
PARAMS = {
    "alto": dict(sigma=1.2, q=90, s_ao=0.55, alvo=0.6, joelho=0.62),
    "medio": dict(sigma=1.2, q=88, s_ao=0.55, alvo=0.6, joelho=0.62),
    "baixo": dict(sigma=1.5, q=86, s_ao=0.6, alvo=0.6, joelho=0.62),
}

M_IN = np.array([[0.59719, 0.35458, 0.04823], [0.07600, 0.90834, 0.01566], [0.02840, 0.13383, 0.83777]], np.float32)
M_OUT = np.array([[1.60475, -0.53108, -0.07367], [-0.10208, 1.10813, -0.00605], [-0.00327, -0.07276, 1.07602]], np.float32)


def aces(c):
    """O ACESFilmic do three (exposição 1) sobre RGB linear (n, 3): devolve RGB linear da tela, 0..1."""
    v = (c / 0.6) @ M_IN.T
    a = v * (v + 0.0245786) - 0.000090537
    b = v * (0.983729 * v + 0.4329510) + 0.238081
    return np.clip((a / b) @ M_OUT.T, 0.0, 1.0)


def srgb(x):
    x = np.clip(x, 0.0, 1.0)
    return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def lum(c):
    return c @ np.array([0.2126, 0.7152, 0.0722], np.float32)


def carregar(pasta, nome):
    a = np.load(os.path.join(pasta, nome + ".npy")).astype(np.float32)
    return a[..., :3] if a.ndim == 3 else a


def redimensionar(a, lado):
    if a.shape[0] == lado:
        return a
    canais = [a] if a.ndim == 2 else [a[..., i] for i in range(a.shape[2])]
    saida = [np.asarray(Image.fromarray(np.ascontiguousarray(c), mode="F").resize((lado, lado), Image.BICUBIC)) for c in canais]
    return saida[0] if a.ndim == 2 else np.stack(saida, axis=-1)


def de_volta_ao_tom(alvo_lin, passos=10):
    """Textura linear T com aces(T) ~ alvo_lin, por ponto fixo (a resposta é quase cinza e monótona)."""
    t = alvo_lin.copy()
    for _ in range(passos):
        t = np.clip(t + (alvo_lin - aces(t)), 0.0, 1.0)
    return t


def radiancia(pasta, P):
    """cor x luz x oclusão (+ cor x marcas) de um atlas; devolve (R, máscara)."""
    cor = carregar(pasta, "cor")
    luz = carregar(pasta, "luz")
    ao = carregar(pasta, "ao")[..., 0]
    lado = cor.shape[0]
    mascara = cor.sum(axis=2) > 1e-6
    ml = np.asarray(Image.fromarray(mascara.astype(np.float32), mode="F").resize((luz.shape[0], luz.shape[0]), Image.BILINEAR)) > 0.5 if luz.shape[0] != lado else mascara
    # luz: sem pontos brancos isolados e um borrão leve contra o ruído do Monte Carlo
    teto = np.percentile(lum(luz[ml]), 99.8) * 3.0
    luz = np.minimum(luz, teto)
    luz = np.stack([ndimage.gaussian_filter(luz[..., i], P["sigma"], mode="nearest") for i in range(3)], axis=-1)
    luz = redimensionar(luz, lado)
    fator_ao = 1.0 - P["s_ao"] * (1.0 - np.clip(ao, 0.0, 1.0))
    R = cor * luz * fator_ao[..., None]
    if os.path.exists(os.path.join(pasta, "marcas.npy")):
        R += cor * redimensionar(carregar(pasta, "marcas"), lado)
    return R, mascara


def principal(pasta, nivel, previa=False):
    P = PARAMS[nivel]
    grupos = [g for g in ("casco", "objetos", "sinais") if os.path.exists(os.path.join(pasta, g, "cor.npy"))]
    R, M = {}, {}
    for g in grupos:
        R[g], M[g] = radiancia(os.path.join(pasta, g), P)
    L = np.concatenate([lum(R[g][M[g]]) for g in grupos if g != "sinais"])   # a exposição vem do casco e dos objetos, como no P5: cartazes não a puxam
    k = P["alvo"] / max(float(np.percentile(L, 99.0)), 1e-6)
    j = P["joelho"]
    teto_aces = aces(np.ones((1, 3), np.float32))[0].mean()
    info = dict(k=float(k), p99=float(np.percentile(L, 99.0)), medio=float(L.mean()))
    for g in grupos:
        D = R[g] * k
        # joelho suave: acima de `joelho` o tom se curva até 1 (nada estoura em branco chapado)
        Dm = np.max(D, axis=2, keepdims=True)
        D = D * np.where(Dm > j, (j + (1 - j) * np.tanh((Dm - j) / (1 - j))) / np.maximum(Dm, 1e-9), 1.0)
        # alvo da tela (linear) -> textura: ACES tira um pouco do topo; pede o que falta, até onde o 8 bits alcança
        D = np.minimum(D * teto_aces, teto_aces)
        lado = D.shape[0]
        T = np.empty_like(D)
        for y in range(0, lado, 256):
            T[y:y + 256] = de_volta_ao_tom(D[y:y + 256].reshape(-1, 3)).reshape(-1, lado, 3)
        img = (srgb(T) * 255.0 + 0.5).astype(np.uint8)[::-1]   # Blender: linha 0 embaixo
        saida = os.path.join(pasta, g, "atlas.jpg")
        Image.fromarray(img).save(saida, quality=P["q"][g] if isinstance(P["q"], dict) else P["q"], subsampling=2, optimize=True)
        if previa:
            Image.fromarray(img).resize((1024, 1024), Image.LANCZOS).save(os.path.join(pasta, g, "atlas-previa.jpg"), quality=85)
        info[g] = dict(bytes=os.path.getsize(saida), lado=int(lado), cobertura=float(M[g].mean()))
    json.dump(info, open(os.path.join(pasta, "compor.json"), "w"), indent=1)
    print(json.dumps(info))


if __name__ == "__main__":
    principal(sys.argv[1], sys.argv[2], "--previa" in sys.argv)

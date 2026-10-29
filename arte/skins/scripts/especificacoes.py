"""O que cada skin entrega e o que a prévia assume para as peças que o Pincel não pinta (sugestões para o Feltro)."""
import os

import cor as C

RAIZ = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
EXPORTADOS = os.path.join(RAIZ, "exportados")

METAL_NIQUEL = dict(cor=C.rgb("#c9ccd1"), rug=0.3, metal=0.95)
METAL_OURO = dict(cor=C.rgb("#c8a23a"), rug=0.25, metal=1.0)
COURO_PRETO = dict(cor=C.rgb("#15110f"), rug=0.7, metal=0.0)
BORRACHA = dict(cor=C.rgb("#101011"), rug=0.85, metal=0.0)
VIROLA = dict(cor=C.rgb("#f3efe6"), rug=0.35, metal=0.0, verniz=0.5)
PRETO_LACA = dict(cor=C.rgb("#0a0c12"), rug=0.28, metal=0.0, verniz=0.9)

SKINS = {
    "coral": {
        "nome": "Coral",
        "faixa": "Camarote",
        # peça pintada: rugosidade, metal e verniz que a pintura sugere ao material do jogo
        "pintadas": {"antebraco": dict(rug=0.26, metal=0.0, verniz=0.85)},
        "lisas": {
            "sola": dict(cor=C.rgb("#76502c"), rug=0.9, metal=0.0),
            "virola": VIROLA,
            "haste": dict(cor=C.rgb("#0e0c12"), rug=0.26, metal=0.0, verniz=0.9,
                          faixas=[(0.000, 0.060, C.rgb("#e0281c")), (0.060, 0.073, C.rgb("#f7de4c")),
                                  (0.150, 0.163, C.rgb("#f7de4c")), (0.163, 0.223, C.rgb("#e0281c")), (0.223, 0.236, C.rgb("#f7de4c")),
                                  (0.310, 0.323, C.rgb("#f7de4c")), (0.323, 0.383, C.rgb("#e0281c")), (0.383, 0.396, C.rgb("#f7de4c")),
                                  (0.470, 0.483, C.rgb("#f7de4c")), (0.483, 0.543, C.rgb("#e0281c")), (0.543, 0.556, C.rgb("#f7de4c")),
                                  (0.630, 0.643, C.rgb("#f7de4c")), (0.643, 0.703, C.rgb("#e0281c")), (0.703, 0.716, C.rgb("#f7de4c"))]),
            "junta": METAL_NIQUEL,
            "punho": COURO_PRETO,
            "anel": METAL_NIQUEL,
            "base": dict(cor=C.rgb("#0e0c12"), rug=0.26, metal=0.0, verniz=0.9,
                         faixas=[(0.10, 0.16, C.rgb("#e0281c")), (0.16, 0.19, C.rgb("#f7de4c")), (0.81, 0.84, C.rgb("#f7de4c")), (0.84, 0.90, C.rgb("#e0281c"))]),
            "borracha": BORRACHA,
        },
        "detalhe": dict(q=0.87, extensao_m=0.12),
    },
    "bicho-solto": {
        "nome": "Bicho Solto",
        "faixa": "Camarote",
        "pintadas": {
            "haste": dict(rug=0.30, metal=0.0, verniz=0.9),
            "antebraco": dict(rug=0.30, metal=0.0, verniz=0.9),
        },
        "lisas": {
            "sola": dict(cor=C.rgb("#76502c"), rug=0.9, metal=0.0),
            "virola": VIROLA,
            "junta": dict(cor=C.rgb("#ff2e93"), rug=0.25, metal=0.0, verniz=0.9),
            "punho": dict(cor=C.rgb("#1b1030"), rug=0.7, metal=0.0),
            "anel": dict(cor=C.rgb("#ff2e93"), rug=0.25, metal=0.0, verniz=0.9),
            "base": dict(cor=C.rgb("#1e8bff"), rug=0.25, metal=0.0, verniz=0.9),
            "borracha": BORRACHA,
        },
        "detalhe": dict(q=0.80, extensao_m=0.14),
    },
    "corujao": {
        "nome": "Corujão",
        "faixa": "Relíquia",
        "pintadas": {
            "haste": dict(rug=0.34, metal=0.0, verniz=0.8),
            "antebraco": dict(rug=0.36, metal=0.0, verniz=0.7),
            "punho": dict(rug=0.62, metal=0.0, verniz=0.0),
        },
        "lisas": {
            "sola": dict(cor=C.rgb("#76502c"), rug=0.9, metal=0.0),
            "virola": VIROLA,
            "junta": dict(cor=C.rgb("#8a8f99"), rug=0.28, metal=0.95),
            "anel": dict(cor=C.rgb("#8a8f99"), rug=0.28, metal=0.95),
            "base": dict(cor=C.rgb("#0b1226"), rug=0.3, metal=0.0, verniz=0.9, faixas=[(0.08, 0.11, C.rgb("#e9dcbc")), (0.89, 0.92, C.rgb("#e9dcbc"))]),
            "borracha": BORRACHA,
        },
        "detalhe": dict(q=0.87, extensao_m=0.18),
    },
    "dragao": {
        "nome": "Dragão das Quinze",
        "faixa": "Relíquia",
        "pintadas": {
            "haste": dict(rug=0.30, metal=0.0, verniz=0.9),
            "antebraco": dict(rug=0.28, metal=0.0, verniz=0.9),
            "base": dict(rug=0.28, metal=0.0, verniz=0.9),
        },
        "lisas": {
            "sola": dict(cor=C.rgb("#76502c"), rug=0.9, metal=0.0),
            "virola": VIROLA,
            "junta": dict(cor=C.rgb("#9db4d8"), rug=0.28, metal=0.95),
            "punho": dict(cor=C.rgb("#1a0f2e"), rug=0.62, metal=0.0),
            "anel": dict(cor=C.rgb("#9db4d8"), rug=0.28, metal=0.95),
            "borracha": BORRACHA,
        },
        "detalhe": dict(q=0.395, extensao_m=0.12),
    },
}


# P3: as duas skins novas (nomes do CS no catálogo, desenhos nossos). O Corujão e o Dragão das Quinze saem da venda (SKINS_FORA).
OURO_BATIDO = dict(cor=C.rgb("#c8972a"), rug=0.26, metal=1.0)
PRATA_BATIDA = dict(cor=C.rgb("#b8c4d4"), rug=0.26, metal=1.0)

SKINS["dragon-lore"] = {
    "nome": "Dragon Lore",
    "faixa": "Relíquia",
    "pintadas": {
        "haste": dict(rug=0.40, metal=1.0, verniz=0.55, metal_mapa=True, forca_emissivo=1.8),
        "antebraco": dict(rug=0.38, metal=1.0, verniz=0.6, metal_mapa=True, forca_emissivo=2.0),
        "base": dict(rug=0.38, metal=1.0, verniz=0.6, metal_mapa=True),
    },
    "lisas": {
        "sola": dict(cor=C.rgb("#76502c"), rug=0.9, metal=0.0),
        "virola": dict(cor=C.rgb("#e9dcb4"), rug=0.35, metal=0.0, verniz=0.5),
        "junta": OURO_BATIDO,
        "punho": dict(cor=C.rgb("#4b2f16"), rug=0.62, metal=0.0,
                      faixas=[(0.04, 0.075, C.rgb("#c8972a")), (0.075, 0.085, C.rgb("#2a1608")), (0.915, 0.925, C.rgb("#2a1608")), (0.925, 0.96, C.rgb("#c8972a"))]),
        "anel": OURO_BATIDO,
        "borracha": BORRACHA,
    },
    "lisas_raro": {"punho": dict(cor=C.rgb("#16452a"), rug=0.62, metal=0.0,
                                 faixas=[(0.04, 0.075, C.rgb("#d6a52e")), (0.075, 0.085, C.rgb("#0f2010")), (0.915, 0.925, C.rgb("#0f2010")), (0.925, 0.96, C.rgb("#d6a52e"))])},
    "detalhe": dict(q=0.82, extensao_m=0.18),
    "detalhe2": dict(q=1.345, extensao_m=0.16),
}

SKINS["howl"] = {
    "nome": "Howl",
    "faixa": "Relíquia",
    "pintadas": {
        "haste": dict(rug=0.34, metal=0.0, verniz=0.8),
        "antebraco": dict(rug=0.34, metal=0.0, verniz=0.8, forca_emissivo=2.0),
        "punho": dict(rug=0.55, metal=0.0, verniz=0.2, forca_emissivo=2.0),
    },
    "lisas": {
        "sola": dict(cor=C.rgb("#76502c"), rug=0.9, metal=0.0),
        "virola": VIROLA,
        "junta": dict(cor=C.rgb("#c4281c"), rug=0.28, metal=0.2, verniz=0.8),
        "anel": dict(cor=C.rgb("#c4281c"), rug=0.28, metal=0.2, verniz=0.8),
        "base": dict(cor=C.rgb("#120a0a"), rug=0.3, metal=0.0, verniz=0.9,
                     faixas=[(0.08, 0.12, C.rgb("#d4301d")), (0.12, 0.14, C.rgb("#ff8a1f")), (0.86, 0.88, C.rgb("#ff8a1f")), (0.88, 0.92, C.rgb("#d4301d"))]),
        "borracha": BORRACHA,
    },
    "lisas_raro": {
        "junta": dict(cor=C.rgb("#2f86d6"), rug=0.28, metal=0.2, verniz=0.8),
        "anel": dict(cor=C.rgb("#2f86d6"), rug=0.28, metal=0.2, verniz=0.8),
        "base": dict(cor=C.rgb("#0a111e"), rug=0.3, metal=0.0, verniz=0.9,
                     faixas=[(0.08, 0.12, C.rgb("#2f86d6")), (0.12, 0.14, C.rgb("#e2f6ff")), (0.86, 0.88, C.rgb("#e2f6ff")), (0.88, 0.92, C.rgb("#2f86d6"))]),
    },
    "detalhe": dict(q=0.83, extensao_m=0.18),
    "detalhe2": dict(q=1.15, extensao_m=0.20),
}

SKINS_FORA = ("corujao", "dragao")  # substituídos por Howl e Dragon Lore; a arte fica em exportados/, mas não vai à venda
NOVAS = ("dragon-lore", "howl")


def caminho_png(skin, peca, sufixo=""):
    return os.path.join(EXPORTADOS, f"{skin}-{peca}{sufixo}.png")

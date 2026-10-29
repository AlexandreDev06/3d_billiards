"""As fontes dos materiais assados, dentro do Blender (P5): fotos PBR CC0 (`arte/boteco/fotos/`) mais sujeira e desgaste por nós de sombreamento.

Só `construir.py` usa. Cada receita liga ao `Principled BSDF` uma cor (foto + manchas + sujeira) e um mapa de normais; o Cycles a assa no atlas. As manchas usam
a posição no mundo (`Geometry.Position`; o jogo (x, y, z) é (x, -z, y) no Blender), então não repetem de uma parede para a outra, e a altura sobre o piso é `Z + 0,8`.
Os UVs que chegam do `cena.py` estão em metros (a foto divide pela escala dela); os decais (trinca, anéis de copo) usam extensão CLIP.
"""
import math
import os

import bpy

PISO = -0.8


class NB:
    """Pequeno construtor de nós."""

    def __init__(self, mat):
        self.mat = mat
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.saida = self.nt.nodes.new("ShaderNodeOutputMaterial")
        self.p = self.nt.nodes.new("ShaderNodeBsdfPrincipled")
        self.nt.links.new(self.p.outputs["BSDF"], self.saida.inputs["Surface"])
        self._pos = None
        self._uv = None
        self.imgs = {}

    def no(self, tipo, **kw):
        n = self.nt.nodes.new(tipo)
        for k, v in kw.items():
            setattr(n, k, v)
        return n

    def lig(self, a, b):
        self.nt.links.new(a, b)

    # ---- fontes de coordenadas
    def uv(self):
        if self._uv is None:
            self._uv = self.no("ShaderNodeUVMap", uv_map="UVMap").outputs["UV"]
        return self._uv

    def pos(self):
        if self._pos is None:
            self._pos = self.no("ShaderNodeNewGeometry").outputs["Position"]
        return self._pos

    def xyz(self):
        s = self.no("ShaderNodeSeparateXYZ")
        self.lig(self.pos(), s.inputs[0])
        return s.outputs[0], s.outputs[1], s.outputs[2]

    def altura(self):
        """Altura sobre o piso (m)."""
        _, _, z = self.xyz()
        m = self.no("ShaderNodeMath", operation="ADD")
        self.lig(z, m.inputs[0])
        m.inputs[1].default_value = -PISO
        return m.outputs[0]

    def borda(self, raio=0.004, ganho=6.0):
        """Máscara 0..1 das quinas convexas e côncavas (pelo desvio da normal chanfrada contra a normal real): onde a pintura lasca e o plástico clareia."""
        bv = self.no("ShaderNodeBevel", samples=6)
        bv.inputs["Radius"].default_value = raio
        g = self.no("ShaderNodeNewGeometry")
        d = self.no("ShaderNodeVectorMath", operation="DOT_PRODUCT")
        self.lig(bv.outputs["Normal"], d.inputs[0])
        self.lig(g.outputs["Normal"], d.inputs[1])
        return self.mat_("MULTIPLY", self.mat_("SUBTRACT", 1.0, d.outputs["Value"], clamp=True), ganho, clamp=True)

    def convexo(self, de=0.52, ate=0.62):
        """Máscara 0..1 das partes convexas (Pointiness do Cycles, vale para superfícies arredondadas)."""
        g = self.no("ShaderNodeNewGeometry")
        return self.faixa(g.outputs["Pointiness"], de, ate)

    def mapeado(self, vetor, escala=1.0, loc=(0, 0, 0), rot=(0, 0, 0)):
        m = self.no("ShaderNodeMapping", vector_type="POINT")
        self.lig(vetor, m.inputs["Vector"])
        m.inputs["Location"].default_value = loc
        m.inputs["Rotation"].default_value = rot
        s = escala if isinstance(escala, (tuple, list)) else (escala, escala, escala)
        m.inputs["Scale"].default_value = s
        return m.outputs[0]

    # ---- texturas
    def imagem(self, caminho, nao_cor=False):
        chave = (caminho, nao_cor)
        if chave not in self.imgs:
            im = bpy.data.images.get(os.path.basename(os.path.dirname(caminho)) + "/" + os.path.basename(caminho) + ("#n" if nao_cor else ""))
            if im is None:
                im = bpy.data.images.load(caminho)
                im.name = os.path.basename(os.path.dirname(caminho)) + "/" + os.path.basename(caminho) + ("#n" if nao_cor else "")
                im.colorspace_settings.name = "Non-Color" if nao_cor else "sRGB"
            self.imgs[chave] = im
        return self.imgs[chave]

    def tex(self, caminho, vetor, nao_cor=False, ext="REPEAT"):
        n = self.no("ShaderNodeTexImage", interpolation="Linear", extension=ext)
        n.image = self.imagem(caminho, nao_cor)
        self.lig(vetor, n.inputs["Vector"])
        return n

    def foto(self, pasta_fotos, id_, escala, loc=(0, 0), rot=0.0, normal=1.0):
        """(cor, normal, nó da cor) de uma foto PBR do ambientCG em `escala` metros por repetição."""
        v = self.mapeado(self.uv(), 1.0 / escala, (loc[0], loc[1], 0), (0, 0, rot))
        t = self.tex(os.path.join(pasta_fotos, id_, "cor.jpg"), v)
        nor = None
        if normal > 0:
            tn = self.tex(os.path.join(pasta_fotos, id_, "normal.jpg"), v, nao_cor=True)
            nm = self.no("ShaderNodeNormalMap", uv_map="UVMap")
            nm.inputs["Strength"].default_value = normal
            self.lig(tn.outputs["Color"], nm.inputs["Color"])
            nor = nm.outputs["Normal"]
        return t.outputs["Color"], nor

    # ---- matemática e cor
    def mat_(self, op, a, b=None, clamp=False):
        m = self.no("ShaderNodeMath", operation=op)
        m.use_clamp = clamp
        for i, x in enumerate((a, b)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                m.inputs[i].default_value = x
            else:
                self.lig(x, m.inputs[i])
        return m.outputs[0]

    def faixa(self, v, a0, a1, b0=0.0, b1=1.0):
        """Mapeia `v` de [a0, a1] para [b0, b1] com transição suave (smoothstep) e sem passar das pontas."""
        m = self.no("ShaderNodeMapRange", interpolation_type="SMOOTHSTEP")
        m.clamp = True
        if isinstance(v, (int, float)):
            m.inputs["Value"].default_value = v
        else:
            self.lig(v, m.inputs["Value"])
        m.inputs["From Min"].default_value = a0
        m.inputs["From Max"].default_value = a1
        m.inputs["To Min"].default_value = b0
        m.inputs["To Max"].default_value = b1
        return m.outputs["Result"]

    def ruido(self, escala, detalhe=5.0, rug=0.55, loc=(0, 0, 0), esticar=(1, 1, 1)):
        v = self.mapeado(self.pos(), escala, loc)
        if tuple(esticar) != (1, 1, 1):
            v = self.mapeado(v, esticar)
        n = self.no("ShaderNodeTexNoise", noise_dimensions="3D")
        self.lig(v, n.inputs["Vector"])
        n.inputs["Detail"].default_value = detalhe
        n.inputs["Roughness"].default_value = rug
        return n.outputs["Fac"]

    def misturar(self, a, b, fator, tipo="MIX"):
        """cor = lerp(a, b, fator) (tipo MIX) ou lerp(a, a*b, fator) (MULTIPLY); a e b podem ser cor fixa."""
        m = self.no("ShaderNodeMix", data_type="RGBA", blend_type=tipo)
        m.clamp_result = True
        if isinstance(fator, (int, float)):
            m.inputs[0].default_value = fator
        else:
            self.lig(fator, m.inputs[0])
        for i, x in ((6, a), (7, b)):
            if isinstance(x, (tuple, list)):
                m.inputs[i].default_value = (*x, 1.0) if len(x) == 3 else x
            else:
                self.lig(x, m.inputs[i])
        return m.outputs[2]

    def hsv(self, cor, matiz=0.5, sat=1.0, valor=1.0):
        h = self.no("ShaderNodeHueSaturation")
        h.inputs["Hue"].default_value = matiz
        h.inputs["Saturation"].default_value = sat
        h.inputs["Value"].default_value = valor
        self.lig(cor, h.inputs["Color"])
        return h.outputs["Color"]

    def decal(self, base, arquivo, centro, tam, rot=0.0, fator=1.0, mascara=None):
        """Põe um decal RGBA (extensão CLIP) sobre `base`, centrado em `centro` (coordenadas UV, metros) com `tam` = (largura, altura) em metros."""
        v = self.mapeado(self.uv(), (1.0 / tam[0], 1.0 / tam[1], 1.0), (-(centro[0] - tam[0] / 2) / tam[0], -(centro[1] - tam[1] / 2) / tam[1], 0), (0, 0, rot))
        t = self.tex(arquivo, v, ext="CLIP")
        a = t.outputs["Alpha"]
        if fator != 1.0:
            a = self.mat_("MULTIPLY", a, fator)
        if mascara is not None:
            a = self.mat_("MULTIPLY", a, mascara)
        return self.misturar(base, t.outputs["Color"], a)

    def fim(self, cor, normal=None, rug=0.6, extra=None):
        self.lig(cor, self.p.inputs["Base Color"])
        self.p.inputs["Roughness"].default_value = rug
        for nome, valor in (extra or {}).items():
            self.p.inputs[nome].default_value = valor
        if normal is not None:
            self.lig(normal, self.p.inputs["Normal"])
        return self.mat


# ----------------------------------------------------------------- receitas
def _sujeira_de_baixo(nb, h, alcance, forca, cor=(0.45, 0.4, 0.34)):
    """Máscara 0..1 da sujeira que sobe do piso (forte colada nele, some em `alcance` m), com a borda de cima irregular."""
    irreg = nb.ruido(2.5, 5.0, loc=(3, 1, 7))
    topo = nb.mat_("ADD", nb.mat_("MULTIPLY", irreg, alcance * 0.8), alcance * 0.35)
    f = nb.mat_("SUBTRACT", 1.0, nb.mat_("DIVIDE", h, nb.mat_("MAXIMUM", topo, 0.05)), clamp=True)
    return nb.mat_("MULTIPLY", f, forca, clamp=True)


def _manchas(nb, escala, lim0, lim1, forca, loc=(0, 0, 0), esticar=(1, 1, 1), detalhe=6.0):
    r = nb.ruido(escala, detalhe, loc=loc, esticar=esticar)
    return nb.mat_("MULTIPLY", nb.faixa(r, lim0, lim1), forca)


def amortecer_normais(mat, nome):
    """Antes das passes de luz e oclusão: o mapa de normais da foto, a 1 mm por pixel, só faz ruído num atlas de 3 a 10 mm por pixel. Fica um terço da força (um décimo na madeira e na fórmica)."""
    forca = 0.1 if nome in ("madeira", "madeira-clara", "formica") else 0.3
    for n in mat.node_tree.nodes:
        if n.type == "NORMAL_MAP":
            n.inputs["Strength"].default_value *= forca


def receita(mat, nome, spec, pasta_fotos, pasta_tex):
    """Constrói o material fonte `nome` (assado). Devolve o material; sem receita, uma cor lisa ou a textura do spec."""
    nb = NB(mat)
    f = lambda papel, esc, **kw: nb.foto(pasta_fotos, FOTOS[papel], esc, **kw)  # noqa: E731
    h = None

    def alt():
        nonlocal h
        if h is None:
            h = nb.altura()
        return h

    if nome == "azulejo":
        cor, nor = f("azulejo", 1.2)
        cor = nb.hsv(cor, 0.5, 0.95, 0.9)
        sujo = nb.mat_("ADD", _sujeira_de_baixo(nb, alt(), 0.55, 0.55), _manchas(nb, 0.9, 0.55, 0.72, 0.4, (2, 0, 1), (1, 1, 0.55)), clamp=True)
        cor = nb.misturar(cor, (0.5, 0.45, 0.38), sujo, "MULTIPLY")
        gote = _manchas(nb, 5.0, 0.58, 0.7, 0.3, (4, 5, 6), (1.0, 1.0, 0.12), 3.0)   # escorridos verticais de umidade
        cor = nb.misturar(cor, (0.66, 0.6, 0.48), gote, "MULTIPLY")
        for cu, cv, tam, rot in ((2.15, 0.55, 0.42, 0.3), (6.3, 0.95, 0.36, -0.6), (3.9, 0.35, 0.3, 1.1), (8.4, 0.8, 0.4, 0.1)):
            cor = nb.decal(cor, os.path.join(os.path.dirname(pasta_tex), "sinais", "trinca.png"), (cu, cv), (tam, tam), rot)
        return nb.fim(cor, nor, 0.2)
    if nome == "barrado":
        cor, nor = nb.foto(pasta_fotos, FOTOS["barrado"], 1.2, (0.0205, 0.0205))
        sujo = _manchas(nb, 1.4, 0.5, 0.7, 0.45, (1, 3, 5))
        cor = nb.misturar(cor, (0.55, 0.5, 0.42), sujo, "MULTIPLY")
        return nb.fim(cor, nor, 0.2)
    if nome == "reboco":
        base, nor = f("reboco", 1.5)
        gasto, nor2 = f("reboco-gasto", 1.3, loc=(0.37, 0.21))
        base = nb.hsv(base, 0.5, 0.95, 0.9)
        lasca = nb.mat_("MULTIPLY", nb.faixa(nb.ruido(0.65, 7.0, 0.6, (11, 3, 5)), 0.6, 0.66), nb.faixa(nb.ruido(2.2, 4.0, 0.5, (5, 8, 1)), 0.35, 0.55))
        cor = nb.misturar(base, gasto, lasca)
        # umidade que sobe da parede de azulejo e escorre do forro
        h_ = alt()
        sobe = nb.mat_("MULTIPLY", nb.faixa(nb.mat_("SUBTRACT", nb.ruido(1.6, 5.0, 0.6, (1, 9, 2)), nb.mat_("MULTIPLY", nb.mat_("SUBTRACT", h_, 1.55), 0.35)), 0.25, 0.7), 0.5)
        cor = nb.misturar(cor, (0.42, 0.5, 0.36), sobe, "MULTIPLY")
        teto = nb.mat_("MULTIPLY", nb.faixa(h_, 2.6, 3.4), nb.mat_("ADD", 0.25, nb.mat_("MULTIPLY", nb.ruido(1.2, 5.0, 0.6, (7, 7, 7)), 0.5)), clamp=True)
        cor = nb.misturar(cor, (0.7, 0.62, 0.45), teto, "MULTIPLY")
        mancha = _manchas(nb, 0.7, 0.55, 0.78, 0.25, (8, 2, 3), (1, 1, 0.6))
        cor = nb.misturar(cor, (0.55, 0.52, 0.42), mancha, "MULTIPLY")
        return nb.fim(cor, nor, 0.92, {"Specular IOR Level": 0.1})
    if nome == "rodape":
        cor = nb.misturar((0.28, 0.2, 0.14), (0.42, 0.34, 0.26), nb.ruido(18.0, 5.0, 0.6))
        cor = nb.misturar(cor, (0.4, 0.36, 0.3), nb.faixa(nb.ruido(3.0, 6.0), 0.5, 0.75), "MULTIPLY")
        return nb.fim(cor, None, 0.85)
    if nome == "piso":
        # ladrilho hidráulico desenhado (`sinais.ladrilho`): cartela de 4 x 4 ladrilhos de 20 cm = 0,8 m, alinhada ao canto da sala (x0 = -5: 6,25 cartelas)
        t = nb.tex(os.path.join(os.path.dirname(pasta_tex), "sinais", "ladrilho.jpg"), nb.mapeado(nb.uv(), 1.0 / 0.8, (0.25, 0.0, 0.0), (0, 0, 0)))
        cor, nor = t.outputs["Color"], None
        cor = nb.hsv(cor, 0.5, 0.95, 0.92)
        x, y, _ = nb.xyz()
        dx = nb.mat_("MINIMUM", nb.mat_("ADD", x, 5.0), nb.mat_("SUBTRACT", 5.0, x))
        dy = nb.mat_("MINIMUM", nb.mat_("ADD", y, 3.2), nb.mat_("SUBTRACT", 3.2, y))
        d = nb.mat_("MINIMUM", dx, dy)
        canto = nb.mat_("MULTIPLY", nb.mat_("SUBTRACT", 1.0, nb.mat_("DIVIDE", d, nb.mat_("ADD", 0.3, nb.mat_("MULTIPLY", nb.ruido(3.0, 4.0, 0.5, (1, 4, 9)), 0.5))), clamp=True), 0.55)
        cor = nb.misturar(cor, (0.38, 0.33, 0.27), canto, "MULTIPLY")
        pisado = nb.mat_("MULTIPLY", nb.faixa(nb.ruido(0.8, 5.0, 0.55, (3, 2, 0), (1.0, 0.6, 1)), 0.42, 0.62), 0.35)
        cor = nb.misturar(cor, (1.2, 1.14, 1.04), pisado, "MULTIPLY")     # onde o povo passa, o ladrilho fica mais claro
        nodoa = nb.mat_("MULTIPLY", nb.faixa(nb.ruido(5.5, 3.0, 0.5, (9, 1, 4)), 0.64, 0.74), 0.55)
        cor = nb.misturar(cor, (0.26, 0.17, 0.1), nodoa, "MULTIPLY")
        return nb.fim(cor, nor, 0.45, {"Specular IOR Level": 0.2})
    if nome in ("forro", "viga"):
        if nome == "forro":
            cor, nor = f("forro", 1.2)
            cor = nb.hsv(cor, 0.5, 0.85, 0.85)
        else:
            cor, nor = f("madeira", 0.9)
            cor = nb.hsv(cor, 0.5, 0.9, 0.85)
        fumaca = nb.mat_("MULTIPLY", nb.faixa(nb.ruido(0.9, 6.0, 0.55, (4, 6, 1)), 0.4, 0.72), 0.5)
        cor = nb.misturar(cor, (0.55, 0.45, 0.32), fumaca, "MULTIPLY")
        return nb.fim(cor, nor, 0.85)
    if nome in ("madeira", "madeira-clara"):
        cor, nor = f("madeira" if nome == "madeira" else "madeira-clara", 0.9 if nome == "madeira" else 1.0)
        gasto = nb.mat_("MULTIPLY", nb.faixa(nb.ruido(3.0, 6.0, 0.6, (2, 8, 3)), 0.45, 0.7), 0.4)
        cor = nb.misturar(cor, (1.45, 1.3, 1.15), gasto, "MULTIPLY")   # o uso clareia a madeira sem desbotar para o rosa
        if nome == "madeira":
            x, y, z = nb.xyz()
            # anéis de copo só no tampo do balcão (x -3,92..-3,23 na mesa, y (Blender) -0,9..3,2 ao longo, altura 0,3)
            janela_z = nb.mat_("SUBTRACT", 1.0, nb.faixa(nb.mat_("ABSOLUTE", nb.mat_("SUBTRACT", z, 0.3)), 0.012, 0.03), clamp=True)
            comp, lar = 4.1, 0.69
            u = nb.mat_("DIVIDE", nb.mat_("ADD", y, 0.9), comp)
            v = nb.mat_("DIVIDE", nb.mat_("SUBTRACT", x, -3.92), lar)
            vet = nb.no("ShaderNodeCombineXYZ")
            nb.lig(u, vet.inputs[0])
            nb.lig(v, vet.inputs[1])
            t = nb.tex(os.path.join(os.path.dirname(pasta_tex), "sinais", "aneis-de-copo.png"), vet.outputs[0], ext="CLIP")
            cor = nb.misturar(cor, t.outputs["Color"], nb.mat_("MULTIPLY", t.outputs["Alpha"], janela_z))
        return nb.fim(cor, nor, 0.42)
    if nome == "formica":
        cor, nor = f("formica", 1.2)
        cor = nb.misturar(nb.hsv(cor, 0.5, 0.0, 1.35), (0.66, 0.1, 0.07), 1.0, "MULTIPLY")   # a foto vira o desenho do granilite; a cor é a da fórmica vermelha
        sujo = _sujeira_de_baixo(nb, alt(), 0.45, 0.6)
        cor = nb.misturar(cor, (0.35, 0.22, 0.16), sujo, "MULTIPLY")
        return nb.fim(cor, nor, 0.4)
    if nome == "aco":
        cor, nor = nb.foto(pasta_fotos, FOTOS["aco"], 1.0, rot=math.pi / 2)
        cor = nb.hsv(cor, 0.5, 0.35, 0.62)
        cor = nb.misturar(cor, (0.8, 0.5, 0.3), nb.mat_("MULTIPLY", nb.faixa(nb.ruido(4.0, 6.0, 0.6, (3, 1, 2), (1, 1, 0.2)), 0.55, 0.75), 0.6), "MULTIPLY")
        # o vale entre as lâminas da porta de enrolar (a geometria tem 36 lâminas de 60,3 mm a partir de 8 cm do piso): linha escura de ~4 mm e um fio de luz no topo
        f_ = nb.mat_("FRACT", nb.mat_("DIVIDE", nb.mat_("SUBTRACT", alt(), 0.08), 0.0603))
        d_ = nb.mat_("MINIMUM", f_, nb.mat_("SUBTRACT", 1.0, f_))
        cor = nb.misturar(cor, (0.03, 0.03, 0.035), nb.mat_("MULTIPLY", nb.faixa(d_, 0.0, 0.09, 1.0, 0.0), 0.85))
        cor = nb.misturar(cor, (0.9, 0.9, 0.88), nb.mat_("MULTIPLY", nb.faixa(d_, 0.2, 0.3, 0.0, 0.2), 1.0), "MIX")
        return nb.fim(cor, nor, 0.5, {"Metallic": 0.0})
    if nome == "caixilho":
        tinta = nb.misturar((0.075, 0.24, 0.2), (0.12, 0.34, 0.29), nb.ruido(18.0, 5.0, 0.6, (3, 1, 8)))
        madeira, _ = nb.foto(pasta_fotos, FOTOS["madeira"], 0.8)
        lasca = nb.mat_("MAXIMUM", nb.mat_("MULTIPLY", nb.faixa(nb.ruido(9.0, 6.0, 0.6, (4, 7, 2)), 0.6, 0.68), 0.9), nb.mat_("MULTIPLY", nb.mat_("MAXIMUM", nb.borda(0.004, 7.0), nb.convexo(0.53, 0.6)), 0.95))
        cor = nb.misturar(tinta, nb.hsv(madeira, 0.5, 0.7, 0.8), lasca)
        sujo = nb.mat_("MULTIPLY", nb.faixa(nb.ruido(2.4, 5.0, 0.55, (6, 2, 9)), 0.5, 0.78), 0.45)
        cor = nb.misturar(cor, (0.45, 0.4, 0.33), sujo, "MULTIPLY")
        return nb.fim(cor, None, 0.55)
    if nome in ("vinil", "plastico-branco", "plastico-vermelho", "plastico-preto", "plastico-azul", "folha", "ferro", "geladeira", "ceramica", "salgado", "ovo", "borracha", "neon-placa"):
        base = tuple(spec.get("cor", (0.5, 0.5, 0.5)))
        cor = nb.misturar(tuple(0.78 * c for c in base), tuple(min(c * 1.15, 1.0) for c in base), nb.ruido(25.0 if nome != "geladeira" else 4.0, 5.0))
        if nome in ("plastico-branco", "plastico-vermelho", "plastico-preto", "ceramica", "geladeira", "ferro", "vinil"):
            sujo = _sujeira_de_baixo(nb, alt(), 0.3, 0.5)
            amar = nb.mat_("MULTIPLY", nb.faixa(nb.ruido(2.0, 4.0, 0.5, (6, 2, 8)), 0.5, 0.8), 0.25)
            cor = nb.misturar(cor, (0.5, 0.45, 0.4), nb.mat_("ADD", sujo, amar, clamp=True), "MULTIPLY")
        if nome == "ferro":
            ferr = nb.mat_("MULTIPLY", nb.faixa(nb.ruido(9.0, 5.0, 0.6, (5, 2, 1)), 0.6, 0.75), 0.7)
            lasca = nb.mat_("MULTIPLY", nb.mat_("MAXIMUM", nb.borda(0.003, 8.0), nb.convexo(0.53, 0.6)), 0.85)
            cor = nb.misturar(cor, (0.28, 0.12, 0.05), nb.mat_("MAXIMUM", ferr, lasca))
        if nome in ("plastico-branco", "plastico-vermelho", "plastico-preto", "plastico-azul", "geladeira"):
            # arranhões finos em duas direções, quinas gastas (clareiam: o plástico branqueia onde bate) e o uso no tampo
            arr = nb.mat_("ADD", nb.mat_("MULTIPLY", nb.faixa(nb.ruido(38.0, 2.0, 0.5, (3, 1, 7), (1, 1, 0.035)), 0.66, 0.74), 0.8), nb.mat_("MULTIPLY", nb.faixa(nb.ruido(38.0, 2.0, 0.5, (9, 4, 2), (0.035, 1, 1)), 0.66, 0.74), 0.8), clamp=True)
            claro = tuple(min(c * 1.45 + 0.10, 1.0) for c in base)
            gasto = nb.mat_("MULTIPLY", nb.mat_("MAXIMUM", nb.borda(0.003, 6.0), nb.convexo(0.53, 0.62)), 0.75)
            cor = nb.misturar(cor, claro, nb.mat_("MAXIMUM", arr, gasto))
            nodoa = nb.mat_("MULTIPLY", nb.faixa(nb.ruido(7.0, 4.0, 0.55, (2, 5, 1)), 0.66, 0.78), 0.35)   # mancha de gordura
            cor = nb.misturar(cor, (0.55, 0.46, 0.34), nodoa, "MULTIPLY")
        return nb.fim(cor, None, spec.get("rug", 0.6))
    # sem receita: textura do spec (sinais, quadro, decoracao) ou cor lisa
    return generico(mat, nome, spec, pasta_tex)


def generico(mat, nome, spec, pasta_tex, forte_emissao=None):
    """Principled com a cor ou a textura do spec (o material `p`/`e` que o nível baixo assa, ou um sinal)."""
    nb = NB(mat)
    cor = tuple(spec.get("cor", (0.5, 0.5, 0.5)))
    arq = spec.get("tex") or spec.get("emissivo_tex")
    if arq:
        caminho = os.path.join(pasta_tex, arq)
        if not os.path.exists(caminho):
            caminho = os.path.join(os.path.dirname(pasta_tex), "sinais", os.path.basename(arq))
        if os.path.exists(caminho):
            t = nb.tex(caminho, nb.uv())
            if arq.endswith(".png"):
                nb.lig(t.outputs["Color"], nb.p.inputs["Base Color"])
            else:
                nb.lig(t.outputs["Color"], nb.p.inputs["Base Color"])
            nb.p.inputs["Roughness"].default_value = spec.get("rug", 0.6)
            return mat
    nb.p.inputs["Base Color"].default_value = (*cor, 1.0)
    nb.p.inputs["Roughness"].default_value = spec.get("rug", 0.6)
    nb.p.inputs["Metallic"].default_value = spec.get("metal", 0.0)
    return mat


FOTOS = {  # papel -> id (espelha fotos.py)
    "azulejo": "Tiles040", "barrado": "Tiles100", "reboco": "PaintedPlaster003", "reboco-gasto": "PaintedPlaster010",
    "madeira": "Wood018", "madeira-clara": "Wood013", "forro": "PaintedWood006C", "formica": "Plastic007", "aco": "CorrugatedSteel003",
}


# ----------------------------------------------------------------- materiais da cena de assar (os que NÃO são assados) e da exportação
def pbr(mat, nome, spec, pasta_tex, emissao=None):
    """Material PBR do .glb (e fonte de luz/oclusão no Blender): cor, textura, metal, emissivo e alfa."""
    nb = NB(mat)
    p = nb.p
    cor = tuple(spec.get("cor", (0.8, 0.8, 0.8)))
    p.inputs["Base Color"].default_value = (*cor, 1.0)
    p.inputs["Roughness"].default_value = spec.get("rug", 0.6)
    p.inputs["Metallic"].default_value = spec.get("metal", 0.0)
    p.inputs["Emission Strength"].default_value = 0.0

    def imagem(arq):
        c = os.path.join(pasta_tex, arq)
        if not os.path.exists(c):
            c = os.path.join(os.path.dirname(pasta_tex), "sinais", os.path.basename(arq))
        return nb.tex(c, nb.uv()) if os.path.exists(c) else None

    if "tex" in spec:
        t = imagem(spec["tex"])
        if t:
            nb.lig(t.outputs["Color"], p.inputs["Base Color"])
            if spec.get("alfa_tex"):    # o alfa da textura é a sujeira do vidro
                nb.lig(t.outputs["Alpha"], p.inputs["Alpha"])
    forca = emissao if emissao is not None else 1.0
    if "emissivo" in spec:
        p.inputs["Emission Color"].default_value = (*spec["emissivo"], 1.0)
        p.inputs["Emission Strength"].default_value = forca
    if "emissivo_tex" in spec:
        t = imagem(spec["emissivo_tex"])
        if t:
            nb.lig(t.outputs["Color"], p.inputs["Emission Color"])
            p.inputs["Emission Strength"].default_value = forca
            if spec.get("alfa"):
                nb.lig(t.outputs["Alpha"], p.inputs["Alpha"])
    if spec.get("alfa") and "opac" in spec:
        p.inputs["Alpha"].default_value = spec["opac"]
    if spec.get("alfa"):
        for atr, v in (("surface_render_method", "BLENDED"), ("blend_method", "BLEND")):
            if hasattr(mat, atr):
                try:
                    setattr(mat, atr, v)
                except Exception:
                    pass
    mat.use_backface_culling = not spec.get("duas_faces")
    return mat

"""A tela de pintura: uma peça do taco aberta numa folha plana, desenhada com geometria e nós no Blender e fotografada de cima.

Convenções (iguais às do UV do jogo, `cena/torneado.ts`):
  - 1 unidade do Blender = 1 mm; o canvas vai de (0, 0) a (W, H); x ↔ u (dá a volta), y ↔ v (da ponta, embaixo, ao cabo, em cima).
  - A linha de baixo do PNG é v = 0 (o lado da ponta), a de cima é v = 1 (o lado do cabo), o que o `TextureLoader` do three.js
    (flipY) espera.
  - O desenho fecha na emenda: toda forma que passa da borda é copiada para o outro lado (`poligono` já faz isso).
  - `modo = "cor"` pinta o que se vê; `modo = "emissivo"` repete o mesmo desenho com tudo preto, menos o que pede `brilho`.

Uso: `blender -b --factory-startup --python <script> -- <argumentos>`; cada script de skin monta uma `Tela` por peça.
"""
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cor as C  # noqa: E402
import medidas as M  # noqa: E402

PASSO_Z = 0.002  # mm entre camadas empilhadas


def _configurar_cycles(sc, amostras):
    sc.render.engine = "CYCLES"
    cy = sc.cycles
    cy.samples = amostras
    cy.use_denoising = False
    cy.use_adaptive_sampling = False
    cy.filter_width = 1.5
    cy.max_bounces = 4
    cy.transparent_max_bounces = 256
    cy.device = "CPU"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        for tipo in ("OPTIX", "CUDA"):
            try:
                prefs.compute_device_type = tipo
                prefs.get_devices()
                if any(d.type == tipo for d in prefs.devices):
                    for d in prefs.devices:
                        d.use = d.type == tipo
                    cy.device = "GPU"
                    break
            except Exception:
                continue
    except Exception:
        pass


def _cor_padrao(sc):
    sc.view_settings.view_transform = "Standard"
    sc.view_settings.look = "None"
    sc.view_settings.exposure = 0.0
    sc.view_settings.gamma = 1.0
    sc.display_settings.display_device = "sRGB"


def _material_emissivo(nome, alfa):
    """Emissão pura lendo a cor (e o alfa) do atributo `cor` da malha: o que sai é a cor pintada, sem luz nenhuma."""
    m = bpy.data.materials.new(nome)
    nt = m.node_tree if m.node_tree else None
    if nt is None:
        m.use_nodes = True
        nt = m.node_tree
    nt.nodes.clear()
    atr = nt.nodes.new("ShaderNodeAttribute")
    atr.attribute_name = "cor"
    emi = nt.nodes.new("ShaderNodeEmission")
    saida = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(atr.outputs["Color"], emi.inputs["Color"])
    if alfa:
        transp = nt.nodes.new("ShaderNodeBsdfTransparent")
        mix = nt.nodes.new("ShaderNodeMixShader")
        nt.links.new(atr.outputs["Alpha"], mix.inputs["Fac"])
        nt.links.new(transp.outputs[0], mix.inputs[1])
        nt.links.new(emi.outputs[0], mix.inputs[2])
        nt.links.new(mix.outputs[0], saida.inputs["Surface"])
    else:
        nt.links.new(emi.outputs[0], saida.inputs["Surface"])
    return m


class Lote:
    """Muitas formas numa malha só (uma cor por vértice). `alfa=True` deixa cada vértice ter transparência."""

    def __init__(self, tela, nome, alfa=False):
        self.tela, self.nome, self.alfa = tela, nome, alfa
        self.verts, self.tris, self.cores = [], [], []

    def tri(self, pts3, cores):
        i = len(self.verts)
        self.verts.extend(pts3)
        self.cores.extend(cores)
        self.tris.append((i, i + 1, i + 2))

    def construir(self):
        if not self.tris:
            return None
        malha = bpy.data.meshes.new(self.nome)
        malha.from_pydata(self.verts, [], self.tris)
        malha.update()
        atr = malha.color_attributes.new("cor", "FLOAT_COLOR", "POINT")
        plano = []
        for c in self.cores:
            plano.extend(c)
        atr.data.foreach_set("color", plano)
        ob = bpy.data.objects.new(self.nome, malha)
        self.tela.cena.collection.objects.link(ob)
        ob.data.materials.append(_material_emissivo(self.nome, self.alfa))
        return ob


class Tela:
    def __init__(self, nome, peca, modo="cor", amostras=64, ppm=None, girar=False):
        """`girar=True`: o desenho é feito de pé com o alto para a ponta do taco (na câmera do jogo a ponta fica no alto da tela) e a
        câmera gira 180° ao fotografar: o PNG sai de cabeça para baixo, como o jogo vai mostrá-lo. `y_de_q` já leva isso em conta."""
        self.nome, self.peca, self.modo, self.girar = nome, peca, modo, girar
        w_px, h_px, padrao = M.tamanho_em_pixels(peca)
        if ppm is not None and ppm != padrao:
            m = M.medidas_da_peca(peca)
            w_px = int(round(m["circunferencia_mm"] * ppm / 2)) * 2
            h_px = int(round(m["comprimento_mm"] * ppm / 2)) * 2
        else:
            ppm = padrao
        self.ppm, self.w_px, self.h_px = ppm, w_px, h_px
        self.W, self.H = w_px / ppm, h_px / ppm
        self.med = M.medidas_da_peca(peca)
        self.q0_mm = self.med["de_m"] * 1000.0
        self.circ_ref = self.med["circunferencia_mm"]

        bpy.ops.wm.read_factory_settings(use_empty=True)
        self.cena = bpy.context.scene
        self.cena.name = nome
        sc = self.cena
        _configurar_cycles(sc, amostras)
        _cor_padrao(sc)
        sc.render.resolution_x, sc.render.resolution_y = w_px, h_px
        sc.render.resolution_percentage = 100
        sc.render.film_transparent = False
        sc.render.image_settings.file_format = "PNG"
        sc.render.image_settings.color_mode = "RGB"
        sc.render.image_settings.color_depth = "8"
        sc.render.image_settings.compression = 15
        sc.render.use_persistent_data = False
        mundo = bpy.data.worlds.new("preto")
        sc.world = mundo
        mundo.color = (0, 0, 0)
        try:  # o mundo novo nasce cinza (0,05): o que não for pintado tem de sair preto, senão o mapa emissivo acende o taco todo
            mundo.use_nodes = True
            fundo_no = next(n for n in mundo.node_tree.nodes if n.type == "BACKGROUND")
            fundo_no.inputs["Color"].default_value = (0.0, 0.0, 0.0, 1.0)
            fundo_no.inputs["Strength"].default_value = 0.0
        except Exception:
            pass

        cam = bpy.data.cameras.new("ortografica")
        cam.type = "ORTHO"
        cam.ortho_scale = max(self.W, self.H)
        cam.clip_start, cam.clip_end = 1.0, 1000.0
        co = bpy.data.objects.new("camera", cam)
        sc.collection.objects.link(co)
        co.location = (self.W / 2, self.H / 2, 200.0)
        if girar:
            co.rotation_euler = (0.0, 0.0, math.pi)
        sc.camera = co

        self._z = 0.0
        self.lote_opaco = Lote(self, nome + "-opaco")
        self.lote_alfa = Lote(self, nome + "-alfa", alfa=True)
        self._extras = []

    # ---- coordenadas do taco ------------------------------------------------------------------------------
    def y_de_q(self, q_m):
        """Altura no canvas (mm) de um ponto a `q_m` metros da ponta do taco."""
        y = q_m * 1000.0 - self.q0_mm
        return self.H - y if self.girar else y

    def q_de_y(self, y_mm):
        y = self.H - y_mm if self.girar else y_mm
        return (y + self.q0_mm) / 1000.0

    def fh(self, y_mm):
        """Compressão horizontal que o cone pede a esta altura: C_ref / C(q) (1 = a circunferência média da peça)."""
        q = self.q_de_y(y_mm)
        return self.circ_ref / (M.circunferencia(self.peca, min(max(q, M.de(self.peca)), M.ate(self.peca))) * 1000.0)

    def circ_em(self, y_mm):
        q = self.q_de_y(y_mm)
        return M.circunferencia(self.peca, min(max(q, M.de(self.peca)), M.ate(self.peca))) * 1000.0

    # ---- formas ----------------------------------------------------------------------------------------------
    def z(self, passos=1):
        self._z += PASSO_Z * passos
        return self._z

    def _cor(self, cor, brilho):
        if self.modo == "emissivo":
            return (0.0, 0.0, 0.0) if brilho is None else brilho
        return cor

    def poligono(self, pts, cor, brilho=None, alfa=None, centro=None, cor_centro=None, alfa_centro=None, brilho_centro=None, repetir=True, malha=1.2):
        """Um polígono preenchido.

        `cor` e `brilho` são (r, g, b) sRGB 0..1, ou funções f(x, y) → (r, g, b[, a]) avaliadas em cada vértice depois de dividir o
        polígono em triângulos de até `malha` mm (é assim que se pinta um degradê, uma luz e uma sombra dentro da forma).
        `brilho` é a cor no mapa emissivo (sem ele a forma fica preta lá).
        `centro` + `cor_centro`/`alfa_centro`: leque de triângulos a partir do centro (degradê radial, para formas em estrela).
        `alfa`: transparência (1 = opaco); `alfa=True` diz que a função de cor devolve o alfa.
        """
        if len(pts) < 3:
            return
        deslocamentos = (0.0,)
        if repetir:
            xs = [p[0] for p in pts]
            lo, hi = min(xs), max(xs)
            base = 0.0
            if (lo + hi) / 2 < 0 or (lo + hi) / 2 >= self.W:
                base = -math.floor(((lo + hi) / 2) / self.W) * self.W
            deslocamentos = tuple(d for d in (base - self.W, base, base + self.W) if hi + d >= 0 and lo + d <= self.W)
            if not deslocamentos:
                return
        funcional = callable(cor) or callable(brilho)
        usa_alfa = alfa is not None or alfa_centro is not None
        lote = self.lote_alfa if usa_alfa else self.lote_opaco
        a_borda = 1.0 if (alfa is None or alfa is True) else alfa
        a_centro = a_borda if alfa_centro is None else alfa_centro
        if funcional:
            fn = brilho if self.modo == "emissivo" else cor
            if self.modo == "emissivo" and brilho is None:
                fn = (0.0, 0.0, 0.0)
            tris = _refinar([(pts[i], pts[j], pts[k]) for (i, j, k) in _triangular(pts)], malha) if centro is None else None
            if centro is not None:
                n = len(pts)
                tris = _refinar([(centro, pts[i], pts[(i + 1) % n]) for i in range(n)], malha)
            for dx in deslocamentos:
                z = self.z()
                for tri in tris:
                    cs = []
                    for (px, py) in tri:
                        v = fn(px, py) if callable(fn) else fn
                        al = v[3] if len(v) > 3 else a_borda
                        cs.append(C.linear(v) + (al,))
                    lote.tri([(tri[0][0] + dx, tri[0][1], z), (tri[1][0] + dx, tri[1][1], z), (tri[2][0] + dx, tri[2][1], z)], cs)
            return
        a_cen = a_centro
        c_borda = self._cor(cor, brilho)
        if centro is not None:
            c_centro = self._cor(cor_centro if cor_centro is not None else cor, brilho_centro if brilho_centro is not None else brilho)
        for dx in deslocamentos:
            z = self.z()
            if centro is not None:
                cx, cy = centro
                n = len(pts)
                for i in range(n):
                    a, b = pts[i], pts[(i + 1) % n]
                    lote.tri(
                        [(cx + dx, cy, z), (a[0] + dx, a[1], z), (b[0] + dx, b[1], z)],
                        [C.linear(c_centro) + (a_cen,), C.linear(c_borda) + (a_borda,), C.linear(c_borda) + (a_borda,)],
                    )
            else:
                lc = C.linear(c_borda) + (a_borda,)
                for (i, j, k) in _triangular(pts):
                    lote.tri([(pts[i][0] + dx, pts[i][1], z), (pts[j][0] + dx, pts[j][1], z), (pts[k][0] + dx, pts[k][1], z)], [lc, lc, lc])

    def plano_shader(self, material, z=None, cobertura=None):
        """Um quadrilátero que cobre o canvas (ou `cobertura = (x0, y0, x1, y1)`) com um material de nós, com UV de 0 a 1."""
        x0, y0, x1, y1 = cobertura if cobertura else (0.0, 0.0, self.W, self.H)
        malha = bpy.data.meshes.new(self.nome + "-plano")
        zz = self.z() if z is None else z
        malha.from_pydata([(x0, y0, zz), (x1, y0, zz), (x1, y1, zz), (x0, y1, zz)], [], [(0, 1, 2, 3)])
        malha.uv_layers.new(name="UV")
        uv = malha.uv_layers["UV"].data
        for i, (u, v) in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
            uv[i].uv = (u, v)
        malha.update()
        ob = bpy.data.objects.new(self.nome + "-plano", malha)
        self.cena.collection.objects.link(ob)
        ob.data.materials.append(material)
        self._extras.append(ob)
        return ob

    def fundo(self, cor, brilho=None):
        self.poligono([(-self.W, -10), (2 * self.W, -10), (2 * self.W, self.H + 10), (-self.W, self.H + 10)], cor, brilho=brilho, repetir=False)

    # ---- saída --------------------------------------------------------------------------------------------------
    def renderizar(self, caminho):
        self.lote_opaco.construir()
        self.lote_alfa.construir()
        os.makedirs(os.path.dirname(os.path.abspath(caminho)), exist_ok=True)
        self.cena.render.filepath = os.path.abspath(caminho)
        bpy.ops.render.render(write_still=True)
        return caminho


def _triangular(pts):
    """Triângulos (índices) de um polígono simples, côncavo ou não, com a triangulação do próprio Blender."""
    from mathutils import Vector
    from mathutils.geometry import tessellate_polygon

    res = tessellate_polygon([[Vector((p[0], p[1], 0.0)) for p in pts]])
    return [tuple(t) for t in res]


def _refinar(tris, hmax):
    """Divide cada triângulo pela maior aresta até nenhuma passar de `hmax` mm."""
    saida = []
    pilha = list(tris)
    while pilha:
        a, b, c = pilha.pop()
        lab = math.hypot(a[0] - b[0], a[1] - b[1])
        lbc = math.hypot(b[0] - c[0], b[1] - c[1])
        lca = math.hypot(c[0] - a[0], c[1] - a[1])
        m = max(lab, lbc, lca)
        if m <= hmax:
            saida.append((a, b, c))
        elif lab == m:
            mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            pilha.append((a, mid, c))
            pilha.append((mid, b, c))
        elif lbc == m:
            mid = ((b[0] + c[0]) / 2, (b[1] + c[1]) / 2)
            pilha.append((a, b, mid))
            pilha.append((a, mid, c))
        else:
            mid = ((c[0] + a[0]) / 2, (c[1] + a[1]) / 2)
            pilha.append((a, b, mid))
            pilha.append((mid, b, c))
    return saida


def argumentos():
    """Os argumentos depois do `--` na linha do Blender."""
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1:]
    return []

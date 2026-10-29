"""O céu da madrugada (nós procedurais, periódicos em volta do taco) e as estrelas do Corujão."""
import math

import bpy

import cor as C
import desenho as D
import medidas as M

# cor do céu por posição no taco (q em m, da ponta ao cabo): a ponta é a noite fechada, o cabo já guarda um fio de aurora
CEU = [
    (0.00, "#05071a"),
    (0.45, "#0a1232"),
    (0.90, "#12204a"),
    (1.20, "#1a2e5c"),
    (1.45, "#27406f"),
]


def material_ceu(t, intensidade_nuvem=0.10, escala_nuvem=9.0, rampa_q=None, cor_nevoa_hex="#5d79c9"):
    """Gradiente por q + névoa de ruído (periódica: o u fecha). Emissão pura: é cor de tinta, não luz.

    `rampa_q`: lista (q em m, "#hex") no lugar de CEU; `cor_nevoa_hex`: cor das cristas da névoa."""
    cfg = rampa_q or CEU
    m = bpy.data.materials.new("ceu")
    if m.node_tree is None:
        m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    N = nt.nodes.new
    uv = N("ShaderNodeTexCoord")
    sep = N("ShaderNodeSeparateXYZ")
    nt.links.new(uv.outputs["UV"], sep.inputs[0])
    # q em metros ao longo do taco, a partir de v do canvas desenhado
    q0 = t.q0_mm / 1000.0
    h_m = t.H / 1000.0
    if t.girar:
        qv = N("ShaderNodeMath")
        qv.operation = "MULTIPLY_ADD"  # q = q0 + (1 - v) * h
        inv = N("ShaderNodeMath")
        inv.operation = "SUBTRACT"
        inv.inputs[0].default_value = 1.0
        nt.links.new(sep.outputs["Y"], inv.inputs[1])
        qv.inputs[1].default_value = h_m
        qv.inputs[2].default_value = q0
        nt.links.new(inv.outputs[0], qv.inputs[0])
    else:
        qv = N("ShaderNodeMath")
        qv.operation = "MULTIPLY_ADD"
        qv.inputs[1].default_value = h_m
        qv.inputs[2].default_value = q0
        nt.links.new(sep.outputs["Y"], qv.inputs[0])
    norm = N("ShaderNodeMapRange")
    norm.inputs["From Min"].default_value = 0.0
    norm.inputs["From Max"].default_value = M.COMPRIMENTO
    nt.links.new(qv.outputs[0], norm.inputs["Value"])
    rampa = N("ShaderNodeValToRGB")
    el = rampa.color_ramp.elements
    while len(el) < len(cfg):
        el.new(0.5)
    for e, (q, hexa) in zip(el, cfg):
        e.position = q / M.COMPRIMENTO
        e.color = C.linear(C.rgb(hexa)) + (1.0,)
    nt.links.new(norm.outputs[0], rampa.inputs["Fac"])

    # ruído periódico: o ângulo vira (cos, sin) para a névoa fechar na emenda
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
    raio = t.W / (2 * math.pi) / escala_nuvem  # mm de canvas / mm por célula de ruído
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
    z.inputs[1].default_value = t.H / escala_nuvem
    nt.links.new(sep.outputs["Y"], z.inputs[0])
    comb = N("ShaderNodeCombineXYZ")
    nt.links.new(cx.outputs[0], comb.inputs["X"])
    nt.links.new(cy.outputs[0], comb.inputs["Y"])
    nt.links.new(z.outputs[0], comb.inputs["Z"])
    ruido = N("ShaderNodeTexNoise")
    ruido.noise_dimensions = "3D"
    ruido.inputs["Scale"].default_value = 1.0
    ruido.inputs["Detail"].default_value = 6.0
    ruido.inputs["Roughness"].default_value = 0.58
    ruido.inputs["Distortion"].default_value = 0.5
    nt.links.new(comb.outputs[0], ruido.inputs["Vector"])
    # só as cristas do ruído viram névoa (contraste), e a névoa clareia o azul
    cont = N("ShaderNodeMapRange")
    cont.inputs["From Min"].default_value = 0.52
    cont.inputs["From Max"].default_value = 0.78
    nt.links.new(ruido.outputs["Fac"], cont.inputs["Value"])
    nev = N("ShaderNodeMix")
    nev.data_type = "RGBA"
    nev.blend_type = "ADD"
    nev.inputs[0].default_value = intensidade_nuvem
    nt.links.new(rampa.outputs["Color"], nev.inputs[6])
    cor_nevoa = N("ShaderNodeRGB")
    cor_nevoa.outputs[0].default_value = C.linear(C.rgb(cor_nevoa_hex)) + (1.0,)
    mult = N("ShaderNodeMix")
    mult.data_type = "RGBA"
    mult.blend_type = "MULTIPLY"
    mult.inputs[0].default_value = 1.0
    nt.links.new(cor_nevoa.outputs[0], mult.inputs[6])
    nt.links.new(cont.outputs[0], mult.inputs[7])
    nt.links.new(mult.outputs[2], nev.inputs[7])
    emi = N("ShaderNodeEmission")
    nt.links.new(nev.outputs[2], emi.inputs["Color"])
    sai = N("ShaderNodeOutputMaterial")
    nt.links.new(emi.outputs[0], sai.inputs["Surface"])
    return m


def estrela_de_4(cx, cy, r, achatada=0.16, giro=0.0):
    """Brilho de 4 pontas (como um clarão de estrela)."""
    pts = []
    for i in range(8):
        a = giro + i * math.pi / 4
        raio = r if i % 2 == 0 else r * achatada
        pts.append((cx + raio * math.cos(a), cy + raio * math.sin(a)))
    return pts


def estrelas(t, rng, quantidade, faixa_y=None, brilho_on=False, evitar=None, cores=("#dfe8ff", "#fff4d6", "#b8c8ff"), brilho_todas=False):
    """Salpica estrelas no canvas todo (ou em `faixa_y = (y0, y1)`), pontos e algumas de 4 pontas com clarão."""
    y0, y1 = faixa_y if faixa_y else (0.0, t.H)
    colocadas = 0
    tentativas = 0
    while colocadas < quantidade and tentativas < quantidade * 20:
        tentativas += 1
        x, y = rng.uniform(0, t.W), rng.uniform(y0, y1)
        if evitar and evitar(x, y):
            continue
        colocadas += 1
        c = C.rgb(rng.choice(cores))
        grande = rng.random() < 0.16
        r = rng.uniform(0.28, 0.6) if not grande else rng.uniform(0.9, 1.6)
        f = t.fh(y)
        if grande:
            pts = [(x + (px - x) * f, py) for px, py in estrela_de_4(x, y, r * 1.5, 0.14, rng.uniform(-0.1, 0.1))]
            halo = [(x + (px - x) * f, py) for px, py in D.elipse(x, y, r * 2.2, r * 2.2, n=20)]
            t.poligono(halo, c, alfa=0.0, alfa_centro=0.22, centro=(x, y), cor_centro=c)
            t.poligono(pts, c, brilho=c if brilho_on else None)
        t.poligono([(x + (px - x) * f, py) for px, py in D.elipse(x, y, r, r, n=10)], C.claro(c, 0.3), brilho=c if brilho_on and (grande or brilho_todas) else None)

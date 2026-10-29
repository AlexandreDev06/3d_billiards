"""Dragon Lore: a chama de vitral. Sai da boca do dragão e corre pela haste até a ponta do taco.

Uma fieira de línguas de fogo que saem de um eixo sinuoso (as do meio mais compridas, as das bordas alternando de lado). Cada língua é
feita de faixas encaixadas, do vermelho por fora ao amarelo no miolo, cortadas em células, com contorno claro (o chumbo do vitral) e uma
espiral fina na barriga. O vermelho domina longe da boca e o amarelo perto dela. O emissivo é suave: cada célula brilha com a própria cor,
mais fraca, e os chumbos quase não.

Tudo no papel; `m` é a distância (mm) andada a partir da boca, `s = s_boca - m`.
"""
import math

import cor as C
import desenho as D
import gravura as G

LARG_CHUMBO = 0.30


def suave01(f):
    f = min(max(f, 0.0), 1.0)
    return f * f * (3 - 2 * f)


class Chama:
    CAMADAS = (1.0, 0.60, 0.26)             # largura de cada faixa, em fração da língua
    FIM = (1.0, 0.92, 0.80)                 # onde cada faixa acaba (fração do comprimento da língua)

    def __init__(self, cx, s_boca, s_ponta, x_boca=0.0, onda=210.0):
        self.cx, self.pa, self.pal = cx, cx.pa, cx.pal
        self.s_boca, self.s_ponta, self.x_boca, self.onda = s_boca, s_ponta, x_boca, onda
        self.L = s_boca - s_ponta

    # ---- o eixo ----------------------------------------------------------------------------------------------------------------------
    def V(self, m):
        return self.pa.meia_volta(self.s_boca - m) / 2.0

    def xc(self, m):
        sobe = suave01(m / 140.0)
        return self.x_boca * (1.0 - sobe) + self.V(m) * (0.05 + 0.15 * sobe) * math.sin(2 * math.pi * m / self.onda + 0.6)

    def ponto(self, m, lat):
        """Ponto do papel a `lat` mm do eixo, em m."""
        return (self.xc(m) + lat, self.s_boca - m)

    # ---- as línguas -------------------------------------------------------------------------------------------------------------------
    def linguas(self):
        """[(m_base, lado, comprimento, largura)] da ponta da chama para a boca (a ordem em que se desenha)."""
        saida = []
        m = 0.0
        k = 0
        while m < self.L - 30.0:
            u = m / self.L
            esc = 1.0 - 0.55 * u
            lado = (-1, 1, 0)[k % 3]
            comp = (62.0 * esc + 28.0) * (1.25 if lado == 0 else 1.0)
            comp = min(comp, self.L - m + 8.0)
            larg = self.V(m) * (1.45 if lado else 1.15) * (1.0 - 0.18 * u)
            saida.append((m, lado, comp, larg, k))
            m += 19.0 if lado else 30.0
            k += 1
        return list(reversed(saida))

    def eixo_lingua(self, m0, lado, comp, n=None):
        """Centro da língua: sai do eixo para fora, volta a acompanhá-lo e termina com um repuxo para o lado de fora."""
        n = n or max(int(comp / 0.9), 40)
        pts = []
        x = self.xc(m0) + lado * self.V(m0) * 0.06
        m = m0
        passo = comp / n
        for i in range(n + 1):
            t = i / n
            # rumo (positivo para o lado `lado`): sai de fora, endireita, repuxa na ponta
            th = lado * (0.50 * (1 - t) ** 1.5 - 0.30 * t ** 2.2)
            pts.append((x, self.s_boca - m))
            x += math.sin(th) * passo + (self.xc(m + passo) - self.xc(m)) * 0.85
            m += math.cos(th) * passo
        return pts

    @staticmethod
    def largura_em(t, W):
        r = math.sin(0.5 * math.pi * min(t / 0.30, 1.0))
        return W * (0.42 + 0.58 * r) * max(1.0 - t, 0.0) ** 0.85

    def fatia(self, eixo, W, t0, t1, k, tmax, encolher=0.0):
        """Polígono da faixa k entre os parâmetros t0 e t1 (frações do comprimento da língua) do eixo. `encolher` (mm) afina a faixa
        dos dois lados e a encurta nas pontas: o miolo da célula, que deixa o chumbo claro em volta."""
        n = len(eixo) - 1
        i0, i1 = int(round(t0 * n)), int(round(t1 * n))
        if encolher:
            passo = math.hypot(eixo[1][0] - eixo[0][0], eixo[1][1] - eixo[0][1]) or 1.0
            cut = int(math.ceil(encolher / passo))
            i0, i1 = i0 + (cut if t0 > 0 else 0), i1 - cut
        if i1 - i0 < 1:
            return None
        sub = eixo[i0:i1 + 1]
        ws = []
        for i in range(i0, i1 + 1):
            t = i / n
            w = self.largura_em(t / tmax, W) * k if t < tmax else 0.0
            ws.append(max(w - 2 * encolher, 0.05))
        return D.fita(sub, ws)

    def _celula(self, poly, miolo, cc):
        """Uma célula do vitral: o chumbo claro (polígono inteiro) e o vidro colorido por dentro (`miolo`)."""
        pa, pal = self.pa, self.pal
        cv = pa.pts(poly)
        mi = pa.pts(miolo) if miolo else None
        if pa.canal == "cor":
            pa.t.poligono(cv, pal["vitral_fio"])
            if mi:
                pa.t.poligono(mi, self._textura(cc))
        else:
            pa.t.poligono(cv, (0.0, 0.0, 0.0), brilho=C.escuro(pal["vitral_fio"], 0.85) if pa.canal == "emissivo" else None)
            if mi:
                pa.t.poligono(mi, (0.0, 0.0, 0.0), brilho=C.escuro(cc, 0.55) if pa.canal == "emissivo" else None)

    def halo(self):
        """A aura da chama: uma faixa larga e suave de laranja e amarelo sob o fogo, para a chama aparecer de longe (só na cor)."""
        pa, pal = self.pa, self.pal
        if pa.canal != "cor":
            return
        fim = self.L - 2.0
        n = int(fim / 2.0)
        esq, dir_ = [], []
        for i in range(n + 1):
            m = fim * i / n
            u = m / self.L
            hw = self.V(m) * (1.55 - 0.25 * u) + 2.0
            xc = self.xc(m)
            esq.append((xc - hw, self.s_boca - m))
            dir_.append((xc + hw, self.s_boca - m))
        poly = esq + dir_[::-1]
        v = pal["vitral"]

        def f(x, s):
            m = self.s_boca - s
            u = min(max(m / self.L, 0.0), 1.0)
            hw = self.V(max(m, 0.0)) * (1.55 - 0.25 * u) + 2.0
            d = min(abs(x - self.xc(max(m, 0.0))) / hw, 1.0)
            a = (0.62 - 0.30 * u) * (1.0 - d * d) ** 0.9 * suave01(m / 46.0)
            c = G.mistura(v[2], v[1], min(u * 1.4, 1.0))
            return (c[0], c[1], c[2], a)
        pa.poli(poly, f, alfa=True, malha=1.8)

    def corrente(self):
        """O fio principal da chama: uma fita contínua e sinuosa da boca à ponta, em três faixas encaixadas e cortada em células."""
        pa = self.pa
        fim = self.L - 4.0
        n = int(fim / 0.9)
        ms = [fim * i / n for i in range(n + 1)]
        eixo = [self.ponto(m, 0.0) for m in ms]

        def larg(m):
            u = m / self.L
            return (self.V(m) * 0.58 * (1.0 - 0.45 * u) + 1.4) * min(1.0, 0.35 + m / 18.0) * max(1.0 - (m / fim) ** 6, 0.12)

        for camada, k in enumerate(self.CAMADAS):
            passo_cel = (21.0, 27.0, 36.0)[camada]
            m_a = -passo_cel * (0.35 * camada)
            while m_a < fim:
                m_b = min(m_a + passo_cel, fim)
                i0, i1 = max(int(math.floor(m_a / fim * n)), 0), min(int(math.ceil(m_b / fim * n)), n)
                if i1 - i0 >= 3 and pa.visivel(self.s_boca - ms[i1] - 4, self.s_boca - ms[i0] + 4):
                    sub = eixo[i0:i1 + 1]
                    ws = [larg(ms[i]) * k for i in range(i0, i1 + 1)]
                    cut = int(math.ceil(LARG_CHUMBO / 0.9))
                    poly = D.fita(sub, ws)
                    mi = D.fita(sub[cut:len(sub) - cut], [max(w - 2 * LARG_CHUMBO, 0.05) for w in ws[cut:len(ws) - cut]]) if len(sub) > 2 * cut + 2 else None
                    cc = self._cor(camada, (ms[i0] + ms[i1]) / 2.0)
                    self._celula(poly, mi, cc)
                m_a = m_b

    def pintar(self):
        pa, pal = self.pa, self.pal
        if not pa.visivel(self.s_ponta - 10, self.s_boca + 10, 5.0):
            return
        self.halo()
        self.corrente()
        for (m0, lado, comp, larg, k) in self.linguas():
            if not pa.visivel(self.s_boca - m0 - comp - 6, self.s_boca - m0 + 6):
                continue
            eixo = self.eixo_lingua(m0, lado, comp)
            for j in range(3):
                camada = j
                tmax = self.FIM[camada]
                kk = self.CAMADAS[camada]
                cortes = [0.0, tmax] if camada >= 2 else ([0.0, 0.34 * tmax, 0.68 * tmax, tmax] if camada == 0 else [0.0, 0.5 * tmax, tmax])
                for c in range(len(cortes) - 1):
                    poly = self.fatia(eixo, larg, cortes[c], cortes[c + 1], kk, tmax)
                    if not poly or len(poly) < 4:
                        continue
                    pm = self.fatia(eixo, larg, cortes[c], cortes[c + 1], kk, tmax, LARG_CHUMBO)
                    self._celula(poly, pm, self._cor(camada, m0))
            self.espiral(eixo, larg, lado)

    def _cor(self, camada, m_base):
        """camada 0 = faixa de fora (vermelha), 3 = miolo (amarelo). Longe da boca tudo esfria um degrau (ou dois) para o vermelho."""
        h = min(max(1.0 - 1.15 * m_base / self.L, 0.0), 1.0)
        v = self.pal["vitral"]
        a, b = (v[0], v[1]) if camada == 0 else ((v[1], v[2]) if camada == 1 else (v[2], v[3]))
        return G.mistura(a, b, h * (0.45 if camada == 0 else 1.0))

    def _textura(self, cor_):
        pa = self.pa

        def f(cx_, cy_):
            x, s = pa.inv(cx_, cy_)
            v = G.ruido(x, s, 5.0, 3)
            return G.mistura(C.escuro(cor_, 0.10), C.claro(cor_, 0.12), v)
        return f

    def espiral(self, eixo, W, lado):
        """O repuxo da ponta da língua: uma espiral fina que sai da ponta e se enrola para fora, com contorno claro."""
        pa, pal = self.pa, self.pal
        if W < 5.5 or lado == 0:
            return
        fim = eixo[-1]
        ant = eixo[-4]
        dx, ds = fim[0] - ant[0], fim[1] - ant[1]
        d = math.hypot(dx, ds) or 1.0
        dx, ds = dx / d, ds / d
        r = min(W * 0.46, 6.2)
        # o centro da espiral fica para o lado de fora da ponta
        cx_, cy_ = fim[0] + lado * r * 0.9 + dx * r * 0.2, fim[1] + ds * r * 0.2
        a0 = math.atan2(fim[1] - cy_, fim[0] - cx_)
        esp = []
        N = 56
        for q in range(N + 1):
            u = q / N
            a = a0 - lado * u * 2.5 * math.pi
            rr = r * (1.0 - u * 0.92)
            esp.append((cx_ + rr * math.cos(a), cy_ + rr * math.sin(a)))
        c = self.pal["vitral"][0]
        G.traco(pa, esp, 1.9, pal["vitral_fio"], suavizar=False, ponta0=0.02, ponta1=0.45, em=C.escuro(pal["vitral_fio"], 0.85))
        G.traco(pa, esp, 1.0, c, suavizar=False, ponta0=0.02, ponta1=0.45, em=C.escuro(c, 0.5))

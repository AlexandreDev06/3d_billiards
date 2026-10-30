/** O editor do AdSense do becogames.app. */
export const EDITOR_ADSENSE = 'ca-pub-8270923634039876';

/** O script do Google, pedido uma vez só. */
export const URL_DO_SCRIPT = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${EDITOR_ADSENSE}`;

/** Os ids de bloco do AdSense; `''` = o espaço não aparece. O Principal preenche depois de criar os blocos no painel. */
export const SLOT_MENU = '7849162209';
export const SLOT_FIM = '9144390016';
/** A faixa fixa de baixo durante a partida. */
export const SLOT_PARTIDA = '3909917198';

/** O único endereço onde os anúncios existem: localhost, 127.0.0.1, ngrok e testes nunca geram impressão. */
export const HOSTS_COM_ANUNCIO: readonly string[] = ['sinuca.becogames.app'];

/** `true` só no host de produção e sem `?dev=1`. */
export function anunciosPermitidos(hostname: string, busca: string): boolean {
  if (new URLSearchParams(busca).get('dev') === '1') return false;
  return HOSTS_COM_ANUNCIO.includes(hostname.toLowerCase());
}

/** O script só é carregado quando há ao menos um bloco com id e o host permite. */
export function deveCarregarScript(hostname: string, busca: string, slots: readonly string[]): boolean {
  return anunciosPermitidos(hostname, busca) && slots.some((s) => s !== '');
}

/** O espaço de um bloco aparece quando o host permite e o id não é vazio; a prova visual ignora as duas coisas. */
export function deveMostrarEspaco(slot: string, hostname: string, busca: string, provaVisual: boolean): boolean {
  if (provaVisual) return true;
  return slot !== '' && anunciosPermitidos(hostname, busca);
}

/**
 * A altura que a faixa de baixo toma da janela: 0 sem faixa (sem anúncio, host de teste, menu aberto); 60 px em janela baixa
 * (320x50 responsivo) e 90 px nas demais (728x90). O canvas e o HUD usam o que sobra.
 */
export function alturaDaFaixa(faixaVisivel: boolean, alturaDaJanela: number): number {
  if (!faixaVisivel) return 0;
  return alturaDaJanela < 800 ? 60 : 90;
}

export interface RegistroDeEspacos<T> {
  /** O espaço do `slot`: criado na primeira vez (com um `empurrar`) e o mesmo depois; se a `variante` mudar (prova visual), refaz. */
  obter(slot: string, variante: string): T;
  /** O espaço atual do `slot`, se existe. */
  atual(slot: string): T | undefined;
}

/** Garante um espaço e um `push` por elemento criado, nunca dois no mesmo. */
export function criarRegistroDeEspacos<T>(criar: (slot: string, variante: string) => T, empurrar: (espaco: T) => void, descartar: (espaco: T) => void): RegistroDeEspacos<T> {
  const mapa = new Map<string, { readonly espaco: T; readonly variante: string }>();
  return {
    obter(slot, variante) {
      const ja = mapa.get(slot);
      if (ja !== undefined && ja.variante === variante) return ja.espaco;
      if (ja !== undefined) descartar(ja.espaco);
      const espaco = criar(slot, variante);
      mapa.set(slot, { espaco, variante });
      empurrar(espaco);
      return espaco;
    },
    atual: (slot) => mapa.get(slot)?.espaco,
  };
}

export interface EmpurradorUnico {
  /** Dá o `push` se o espaço tem largura (está no DOM, visível, com layout) e ainda não foi dado; devolve se deu. */
  tentar(larguraDoElemento: number): boolean;
  feito(): boolean;
}

/** O AdSense falha com "No slot size for availableWidth=0" num `ins` escondido: o `push` só com largura > 0, e uma vez só. */
export function criarEmpurradorUnico(empurrar: () => void): EmpurradorUnico {
  let feito = false;
  return {
    tentar(largura) {
      if (feito || !(largura > 0)) return false;
      feito = true;
      empurrar();
      return true;
    },
    feito: () => feito,
  };
}

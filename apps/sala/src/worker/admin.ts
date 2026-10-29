/**
 * As rotas de administração do Worker (L41), só para quem tem o segredo `SEGREDO_ADMIN` (um `secret` do Wrangler, nunca no código nem
 * num arquivo versionado):
 *
 *   POST /admin/importar-carteiras   corpo = o `carteiras.json` da sala Node; `?sobrescrever=1` troca as carteiras que já existem
 *                                    (recusado, 409 `salas-abertas`, enquanto houver sala: trocar carteira com gente sentada
 *                                    tira o dinheiro de quem joga e faz a aposta falhar); `?aceitar-descartadas=1` importa o que
 *                                    presta mesmo com carteira estragada no arquivo
 *   GET  /admin/exportar-carteiras   (L47) a cópia de segurança, o mesmo arquivo que a importação aceita: `carteiras` (as linhas
 *                                    do `carteiras.json`, sem o balão), `baloes` (o balão de cada carteira que o tem) e, desde o L47b,
 *                                    `carteiras_descartadas` (o que o objeto guardou de lado por não conseguir ler). Exporte antes de
 *                                    publicar uma versão nova; se der errado, importe a cópia com `?sobrescrever=1`, com as salas
 *                                    fechadas. O arquivo tem o saldo e os itens de todo mundo: guarde-o como segredo. Os ids são os
 *                                    resumos SHA-256 dos códigos, e o código de ninguém está nele
 *   GET  /admin/carteiras-descartadas (L47b) só a lista de `carteiras_descartadas` (id, dados como estavam, motivo, instante)
 *   POST /admin/importar-carteiras?restaurar=<id>  (L47b, repetível) traz de volta carteiras descartadas: o corpo é uma cópia (a
 *                                    exportação ou o que a rota acima devolveu) e só os ids pedidos voltam, validados pela versão de
 *                                    agora. Nunca troca uma carteira que já existe e pode rodar com salas abertas; não se combina
 *                                    com `sobrescrever` nem com `aceitar-descartadas`
 *   GET  /admin/uso                  contagens do objeto desde que acordou (para conferir o plano gratuito)
 *
 * Sem o segredo configurado (ou curto demais) as rotas não existem (404). A conferência compara resumos SHA-256 byte a byte, sem
 * parar no primeiro byte diferente. Cada IP tem um balde só para estas rotas. A resposta e o log só levam contagens: nunca o
 * conteúdo do arquivo, um código, um `id` nem o segredo (a única exceção é o corpo da exportação, que é o arquivo e só sai para
 * quem tem o segredo, com `Cache-Control: no-store`; o log da exportação diz só quantas carteiras saíram).
 */
import type { CarteirasBase, ResultadoDaImportacao, ResultadoDaRestauracao } from '../carteiras-base';
import { SEGURANCA } from '../cabecalhos';
import { BaldesPorChave } from '../limite-taxa';
import type { Logger } from '../log';
import { lerCorpoDoPedido } from './corpo-do-pedido';

/** O `carteiras.json` de 10 000 carteiras tem uns 3 MB; o teto deixa folga e não deixa um corpo sem fim encher a memória do objeto. */
export const MAX_BYTES_DA_IMPORTACAO = 16 * 1024 * 1024;
const TEMPO_DO_CORPO_MS = 60_000;
export const TAMANHO_MINIMO_DO_SEGREDO = 16;
const BEARER = /^Bearer (\S{1,512})$/;
const ROTAS_GET: ReadonlySet<string> = new Set(['/admin/uso', '/admin/exportar-carteiras', '/admin/carteiras-descartadas']);

const STATUS_DA_RECUSA: Readonly<Record<Extract<ResultadoDaImportacao, { ok: false }>['motivo'], number>> = {
  'arquivo-invalido': 422,
  'carteiras-invalidas': 422,
  'ja-tem-carteiras': 409,
  cheio: 413,
  encerrado: 503,
};

const STATUS_DA_RESTAURACAO: Readonly<Record<Extract<ResultadoDaRestauracao, { ok: false }>['motivo'], number>> = {
  'arquivo-invalido': 422,
  'descartada-nao-encontrada': 404,
  'descartada-invalida': 422,
  'ja-existe': 409,
  cheio: 413,
  encerrado: 503,
};

export interface DependenciasDoAdmin {
  /** O `secret` `SEGREDO_ADMIN`; ausente ou curto = as rotas ficam desligadas. */
  readonly segredo: string | undefined;
  readonly carteiras: CarteirasBase;
  readonly relogio: () => number;
  readonly log: Logger;
  /** Os números que `GET /admin/uso` devolve. */
  readonly uso: () => Record<string, unknown>;
  /** Quantas salas estão abertas agora; `?sobrescrever=1` só vale com zero. */
  readonly salasAbertas: () => number;
}

const resposta = (status: number, corpo: object, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURANCA, ...extra } });

/** Compara dois textos pelo SHA-256 de cada um, byte a byte sem atalho: o tempo não diz quantos caracteres do segredo batem. */
export async function segredoConfere(candidato: string, segredo: string): Promise<boolean> {
  const codificar = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', codificar.encode(candidato)), crypto.subtle.digest('SHA-256', codificar.encode(segredo))]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diferenca = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diferenca |= x[i]! ^ (y[i] ?? 0);
  return diferenca === 0;
}

export class AdminDoWorker {
  private readonly porIp: BaldesPorChave;

  constructor(private readonly deps: DependenciasDoAdmin) {
    // 30 pedidos de rajada e um a cada 10 s depois: sobra para quem administra e não dá para tentar segredos (o segredo tem 16+ caracteres)
    this.porIp = new BaldesPorChave(30, 1 / 10, deps.relogio);
  }

  limpar(): void {
    this.porIp.limpar();
  }

  async tratar(request: Request, url: URL, ip: string): Promise<Response> {
    const { segredo } = this.deps;
    if (segredo === undefined || segredo.length < TAMANHO_MINIMO_DO_SEGREDO) return resposta(404, { erro: 'desligado' });
    const rota = url.pathname;
    const metodos = rota === '/admin/importar-carteiras' ? 'POST' : ROTAS_GET.has(rota) ? 'GET' : null;
    if (metodos === null) return resposta(404, { erro: 'rota-desconhecida' });
    if (request.method !== metodos) return resposta(405, { erro: 'metodo-nao-permitido' }, { Allow: metodos });
    if (!this.porIp.tentar(ip)) return resposta(429, { erro: 'limite' }, { 'Retry-After': '10' });
    const candidato = BEARER.exec(request.headers.get('authorization') ?? '')?.[1];
    if (candidato === undefined || !(await segredoConfere(candidato, segredo))) {
      this.deps.log('admin-recusado', { rota });
      return resposta(401, { erro: 'nao-autorizado' });
    }
    if (rota === '/admin/uso') return resposta(200, this.deps.uso());
    if (rota === '/admin/exportar-carteiras') return this.exportar();
    if (rota === '/admin/carteiras-descartadas') return this.descartadas();
    return this.importar(request, url);
  }

  /** As carteiras que o objeto guardou de lado, como estavam; o log leva só a contagem. */
  private descartadas(): Response {
    const { carteiras, log } = this.deps;
    const lista = carteiras.descartadas();
    log('admin-descartadas', { lidas: lista.length });
    return resposta(200, { carteiras_descartadas: lista });
  }

  /** O arquivo inteiro como está na memória do objeto; o log leva só a contagem. */
  private exportar(): Response {
    const { carteiras, log } = this.deps;
    log('admin-exportacao', { exportadas: carteiras.total });
    return new Response(carteiras.exportar(), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEGURANCA } });
  }

  private async importar(request: Request, url: URL): Promise<Response> {
    const sobrescrever = url.searchParams.get('sobrescrever') === '1';
    const restaurar = url.searchParams.getAll('restaurar');
    if (restaurar.length > 0 && (sobrescrever || url.searchParams.get('aceitar-descartadas') === '1')) return resposta(400, { erro: 'parametros-incompativeis' });
    // Antes de ler o corpo (até 16 MiB): trocar as carteiras com gente sentada nelas tira o saldo de quem joga e faz a aposta falhar
    const salas = sobrescrever ? this.deps.salasAbertas() : 0;
    if (salas > 0) {
      this.deps.log('admin-importacao', { ok: false, motivo: 'salas-abertas', salas });
      return resposta(409, { erro: 'salas-abertas', salas });
    }
    const declarado = Number(request.headers.get('content-length') ?? 0);
    if (declarado > MAX_BYTES_DA_IMPORTACAO) return resposta(413, { erro: 'corpo-grande' });
    const leitura = await lerCorpoDoPedido(request, MAX_BYTES_DA_IMPORTACAO, TEMPO_DO_CORPO_MS);
    switch (leitura.tipo) {
      case 'grande':
        return resposta(413, { erro: 'corpo-grande' });
      case 'lento':
        return resposta(408, { erro: 'corpo-lento' });
      case 'abortado':
        return resposta(400, { erro: 'corpo-abortado' });
      case 'ilegivel':
        return resposta(400, { erro: 'corpo-nao-e-utf8' });
    }
    if (restaurar.length > 0) {
      const volta = this.deps.carteiras.restaurar(leitura.texto, restaurar);
      this.deps.log('admin-restauracao', { ok: volta.ok, ...(volta.ok ? { restauradas: volta.restauradas } : { motivo: volta.motivo }) });
      if (volta.ok) return resposta(200, volta);
      const { motivo, ...resto } = volta;
      return resposta(STATUS_DA_RESTAURACAO[motivo], { erro: motivo, ...resto });
    }
    const r = this.deps.carteiras.importar(leitura.texto, {
      sobrescrever,
      aceitarDescartadas: url.searchParams.get('aceitar-descartadas') === '1',
    });
    this.deps.log('admin-importacao', { ok: r.ok, ...(r.ok ? { importadas: r.importadas } : { motivo: r.motivo }) });
    if (r.ok) return resposta(200, r);
    const { motivo, ...resto } = r;
    return resposta(STATUS_DA_RECUSA[motivo], { erro: motivo, ...resto });
  }
}

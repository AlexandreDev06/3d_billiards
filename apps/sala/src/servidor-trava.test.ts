/**
 * A pasta de dados no servidor (A2 do L22): um servidor por pasta, e o `fechar()` entrega o arquivo e a trava ANTES de
 * soltar a porta, porque é a porta livre que avisa o `reiniciar-sala.sh` a subir o servidor novo.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { CONFIG_SALA_PADRAO } from './config';
import { ErroDeTrava } from './trava';
import { AmbienteDeRede } from './para-testes-ws';

const rede = new AmbienteDeRede();
const pastas: string[] = [];
afterAll(() => rede.encerrar());
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

const pastaDeDados = (): string => {
  const p = mkdtempSync(join(tmpdir(), 'sala-servidor-trava-'));
  pastas.push(p);
  return p;
};

const travaDe = (pasta: string): string => join(pasta, 'carteiras.lock');
const config = (pastaDados: string, esperaTravaMs = 150) => ({ pastaDados, carteira: { ...CONFIG_SALA_PADRAO.carteira, esperaTravaMs } });

/** A porta aceita conexões agora? */
const portaAberta = (porta: number): Promise<boolean> =>
  new Promise((resolve) => {
    const sock = connect(porta, '127.0.0.1');
    sock.once('connect', () => {
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => resolve(false));
  });

const postarCarteira = (porta: number) => fetch(`http://127.0.0.1:${porta}/carteira`, { method: 'POST', headers: { Origin: `http://localhost:${porta}` } });

describe('um servidor por pasta de dados', () => {
  it('o segundo servidor na mesma pasta não sobe e diz por quê; o primeiro segue servindo e gravando', async () => {
    const pastaDados = pastaDeDados();
    const s1 = await rede.subir(config(pastaDados));
    const erro = await rede.subir(config(pastaDados)).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroDeTrava);
    expect((erro as Error).message).toContain(String(process.pid));
    expect((erro as Error).message).toContain('PASTA_DADOS');

    const r = await postarCarteira(s1.porta);
    expect(r.status).toBe(201);
    const { codigo } = (await r.json()) as { codigo: string };
    await s1.carteiras.descarregar();
    expect(readFileSync(join(pastaDados, 'carteiras.json'), 'utf8')).toContain(s1.carteiras.resolver(codigo));
    expect(readFileSync(travaDe(pastaDados), 'utf8').split('\n')[0]).toBe(String(process.pid));
  });

  it('pastas diferentes sobem lado a lado', async () => {
    const a = await rede.subir(config(pastaDeDados()));
    const b = await rede.subir(config(pastaDeDados()));
    expect(a.porta).not.toBe(b.porta);
  });

  it('um servidor que não conseguiu a porta solta a trava da pasta e não deixa timers vivos', async () => {
    const s1 = await rede.subir(config(pastaDeDados()));
    const pastaDados = pastaDeDados();
    const erro = await rede.subir({ ...config(pastaDados), porta: s1.porta, host: '127.0.0.1' }).catch((e: unknown) => e);
    expect((erro as NodeJS.ErrnoException).code).toBe('EADDRINUSE');
    expect(existsSync(travaDe(pastaDados))).toBe(false);
    // a pasta está livre para o próximo
    await rede.subir(config(pastaDados));
  });
});

describe('fechar(): primeiro o arquivo e a trava, depois a porta', () => {
  it('quando a trava some, o arquivo já está gravado e a porta ainda está de pé; só depois a porta fecha', async () => {
    const pastaDados = pastaDeDados();
    const s = await rede.subir(config(pastaDados));
    const r = await postarCarteira(s.porta);
    const { codigo } = (await r.json()) as { codigo: string };
    const id = s.carteiras.resolver(codigo)!;

    const quandoSolta: { trava: boolean; arquivo: string | null; porta: boolean; novaCarteira: number; leitura: number }[] = [];
    const fecharOArmazem = s.carteiras.fechar.bind(s.carteiras);
    s.carteiras.fechar = async () => {
      s.carteiras.fechar = fecharOArmazem; // só esta vez: o encerramento da rede de testes fecha de novo
      await fecharOArmazem();
      // o armazém acabou de fechar; o servidor ainda não soltou a porta
      const nova = await postarCarteira(s.porta).catch(() => ({ status: 0 }));
      const leitura = await fetch(`http://127.0.0.1:${s.porta}/carteira`, { headers: { Authorization: `Bearer ${codigo}` } }).catch(() => ({ status: 0 }));
      quandoSolta.push({
        trava: existsSync(travaDe(pastaDados)),
        arquivo: existsSync(join(pastaDados, 'carteiras.json')) ? readFileSync(join(pastaDados, 'carteiras.json'), 'utf8') : null,
        porta: await portaAberta(s.porta),
        novaCarteira: nova.status,
        leitura: leitura.status,
      });
    };
    await s.fechar();

    expect(quandoSolta).toHaveLength(1);
    expect(quandoSolta[0]!.trava).toBe(false);
    expect(quandoSolta[0]!.arquivo).toContain(id);
    expect(quandoSolta[0]!.porta).toBe(true);
    // com o armazém fechado, o HTTP que ainda atende não aceita mudança (503) e continua lendo
    expect(quandoSolta[0]!.novaCarteira).toBe(503);
    expect(quandoSolta[0]!.leitura).toBe(200);
    expect(await portaAberta(s.porta)).toBe(false);
  });

  it('compra pelo HTTP depois que o armazém fechou: 503, e o saldo do disco não muda', async () => {
    const pastaDados = pastaDeDados();
    const s = await rede.subir(config(pastaDados));
    const { codigo } = (await (await postarCarteira(s.porta)).json()) as { codigo: string };
    s.carteiras.aplicar([{ id: s.carteiras.resolver(codigo)!, delta: 400 }]);
    const fecharOArmazem = s.carteiras.fechar.bind(s.carteiras);
    let status = 0;
    let erro = '';
    s.carteiras.fechar = async () => {
      s.carteiras.fechar = fecharOArmazem; // só esta vez: o encerramento da rede de testes fecha de novo
      await fecharOArmazem();
      const r = await fetch(`http://127.0.0.1:${s.porta}/carteira/comprar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${codigo}`, Origin: `http://localhost:${s.porta}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ skin: 'ebano' }),
      });
      status = r.status;
      erro = ((await r.json()) as { erro: string }).erro;
    };
    await s.fechar();
    expect([status, erro]).toEqual([503, 'limite']);
    const id = s.carteiras.resolver(codigo)!;
    expect(JSON.parse(readFileSync(join(pastaDados, 'carteiras.json'), 'utf8')).carteiras[id].saldo).toBe(500);
  });

  it('reinício: o servidor novo sobe em cima do que está saindo, espera a trava soltar e herda as carteiras', async () => {
    const pastaDados = pastaDeDados();
    const s1 = await rede.subir(config(pastaDados, 5000));
    const { codigo } = (await (await postarCarteira(s1.porta)).json()) as { codigo: string };
    s1.carteiras.aplicar([{ id: s1.carteiras.resolver(codigo)!, delta: 77 }]);

    // o mesmo que o reiniciar-sala.sh faz: derruba o antigo e sobe o novo sem esperar
    const fechando = s1.fechar();
    const s2 = await rede.subir(config(pastaDados, 5000));
    await fechando;
    const r = await fetch(`http://127.0.0.1:${s2.porta}/carteira`, { headers: { Authorization: `Bearer ${codigo}` } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { saldo: number }).saldo).toBe(177);
  });

  it('fechar duas vezes o mesmo servidor não derruba nada', async () => {
    const s = await rede.subir(config(pastaDeDados()));
    await Promise.all([s.fechar(), s.fechar()]);
  });
});

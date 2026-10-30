import { beforeEach, describe, expect, it } from 'vitest';
import { Contas } from './contas';
import type { PedidoDaConta } from './contrato';
import { hashDaSenha, resumoHex } from './cripto';
import { HttpDaConta, MAX_CORPO, type OpcoesDoHttp } from './http';
import { Moedas } from './moedas';
import { aleatorioFixo, bancoDeTeste, carteiroFalso, relogioFalso, type BancoDeTeste } from './para-testes';

const HORA = 3600_000;
const DIA = 24 * HORA;
const PEPPER = 'pepper-de-teste';
const SENHA = 'segredo-bom';
const CODIGO = 'C'.repeat(43);

let b: BancoDeTeste;
let relogio: ReturnType<typeof relogioFalso>;
let moedas: Moedas;
let hashChamado: number;
let logs: { evento: string; dados: Record<string, unknown> }[];
let pendentes: Promise<unknown>[];
let envio: ReturnType<typeof carteiroFalso>;
let http: HttpDaConta;
/** Cada `montar` (um objeto novo) sorteia outra sequência, como o objeto despejado e recriado de verdade. */
let semente: number;

const contarHash: typeof hashDaSenha = (...a) => {
  hashChamado++;
  return hashDaSenha(...a);
};

const pedido = (acao: string, corpo?: object, extra: Partial<PedidoDaConta> = {}): PedidoDaConta => ({
  acao,
  metodo: corpo ? 'POST' : 'GET',
  origem: 'https://becogames.app',
  ip: '1.2.3.4',
  cookie: null,
  convidado: null,
  corpo: corpo ? JSON.stringify(corpo) : null,
  ...extra,
});
const depoisTudo = async (): Promise<void> => void (await Promise.all(pendentes));
const tokenDe = (cookie: string | undefined): string => /^becogames_sessao=([A-Za-z0-9_-]{43});/.exec(cookie ?? '')![1]!;
const comCookie = (cookie: string | undefined): string => `becogames_sessao=${tokenDe(cookie)}`;

function montar(o: Partial<OpcoesDoHttp> & { pepper?: string | null } = {}): HttpDaConta {
  const contas = new Contas({
    sql: b.sql,
    transacao: b.transacao,
    relogio: relogio.agora,
    aleatorio: aleatorioFixo(semente++),
    moedas,
    pepper: o.pepper === undefined ? PEPPER : o.pepper,
    saldoInicial: 100,
    maxContas: 50_000,
    hash: contarHash,
  });
  return new HttpDaConta({
    contas,
    carteiro: envio.carteiro,
    sql: b.sql,
    log: (evento, dados) => void logs.push({ evento, dados }),
    relogio: relogio.agora,
    dominioDoCookie: '.becogames.app',
    cookieSeguro: true,
    origensDeDev: [],
    depois: (p) => void pendentes.push(p),
    ...o,
  });
}

const criar = (email = 'a@b.com', extra: Partial<PedidoDaConta> = {}) => http.tratar(pedido('criar', { email, senha: SENHA, nome: 'A' }, extra));

beforeEach(() => {
  b = bancoDeTeste();
  relogio = relogioFalso();
  moedas = new Moedas(b.sql, b.transacao, relogio.agora);
  hashChamado = 0;
  semente = 9;
  logs = [];
  pendentes = [];
  envio = carteiroFalso();
  http = montar();
});

describe('HttpDaConta: criar, cookie e o conta sem id', () => {
  it('criar devolve o cookie com todos os atributos e sem o id', async () => {
    const r = await criar();
    expect(r.status).toBe(201);
    expect(r.corpo).toEqual({ conta: { nome: 'A', email: 'a@b.com', saldo: 100 } });
    expect(r.cookie).toMatch(/^becogames_sessao=[A-Za-z0-9_-]{43}; Max-Age=7776000; Domain=\.becogames\.app; Path=\/; HttpOnly; Secure; SameSite=Lax$/);
  });
  it('em dev, sem domínio, o cookie é do host; sem Secure só com cookieSeguro falso', async () => {
    const dev = montar({ dominioDoCookie: null, cookieSeguro: false });
    const r = await dev.tratar(pedido('criar', { email: 'a@b.com', senha: SENHA, nome: 'A' }));
    expect(r.cookie).not.toContain('Domain=');
    expect(r.cookie).not.toContain('Secure');
    expect(r.cookie).toMatch(/; Path=\/; HttpOnly; SameSite=Lax$/);
  });
  it('sem domínio mas com cookieSeguro, o cookie leva Secure', async () => {
    const meio = montar({ dominioDoCookie: null });
    expect((await meio.tratar(pedido('criar', { email: 'c@b.com', senha: SENHA, nome: 'A' }))).cookie).toContain('; Secure');
  });
  it('o convidado vira conta com o mesmo saldo e o mesmo id', async () => {
    const id = await resumoHex(CODIGO);
    moedas.garantirConta(id, 100);
    moedas.creditar(id, 40, 'premio:1', { jogo: 'sinuca', motivo: 'teste' });
    const r = await criar('a@b.com', { convidado: CODIGO });
    expect(r.status).toBe(201);
    expect(r.corpo).toEqual({ conta: { nome: 'A', email: 'a@b.com', saldo: 140 } });
    expect(Number(b.sql.exec('SELECT convidado FROM contas WHERE id = ?', id).toArray()[0]!.convidado)).toBe(0);
    // a mesma carteira não vira outra conta
    const de_novo = await criar('c@b.com', { convidado: CODIGO });
    expect(de_novo.status).toBe(409);
    expect(de_novo.corpo).toMatchObject({ erro: 'convidado-ja-e-conta', mensagem: 'Esta carteira já é de uma conta.' });
  });
  it('código de convidado malformado é ignorado: a conta nasce do zero', async () => {
    const r = await criar('a@b.com', { convidado: 'curto' });
    expect(r.corpo).toEqual({ conta: { nome: 'A', email: 'a@b.com', saldo: 100 } });
  });
  it('e-mail repetido é 409 com a mensagem do plano', async () => {
    await criar();
    const r = await criar('  A@B.com ');
    expect(r.status).toBe(409);
    expect(r.corpo).toEqual({ erro: 'email-em-uso', mensagem: 'Este e-mail já tem conta. Entre com ele ou peça uma senha nova.' });
    expect(r.cookie).toBeUndefined();
  });
  it('as mensagens e os status de campo ruim', async () => {
    const ruim = async (corpo: object) => http.tratar(pedido('criar', corpo));
    expect(await ruim({ email: 'x', senha: SENHA, nome: 'A' })).toMatchObject({ status: 400, corpo: { erro: 'email-invalido', mensagem: 'Confira o e-mail.' } });
    expect(await ruim({ email: 'a@b.com', senha: 'curta', nome: 'A' })).toMatchObject({ status: 400, corpo: { erro: 'senha-curta', mensagem: 'A senha precisa ter pelo menos 8 caracteres.' } });
    expect(await ruim({ email: 'a@b.com', senha: 'x'.repeat(129), nome: 'A' })).toMatchObject({ status: 400, corpo: { erro: 'senha-longa', mensagem: 'A senha pode ter até 128 caracteres.' } });
    expect(await ruim({ email: 'a@b.com', senha: SENHA, nome: '' })).toMatchObject({ status: 400, corpo: { erro: 'nome-invalido', mensagem: 'O nome precisa ter de 1 a 20 caracteres.' } });
    expect(await ruim({})).toMatchObject({ status: 400, corpo: { erro: 'email-invalido' } });
    expect(hashChamado).toBe(0);
  });
  it('sem o pepper o Banco está fora do ar (503) e sem a chave não grava nada', async () => {
    const sem = montar({ pepper: null });
    const r = await sem.tratar(pedido('criar', { email: 'a@b.com', senha: SENHA, nome: 'A' }));
    expect(r).toMatchObject({ status: 503, corpo: { erro: 'nao-configurado', mensagem: 'A conta está fora do ar. Tente mais tarde.' } });
  });
});

describe('HttpDaConta: a ordem das checagens', () => {
  it('rota desconhecida é 404, até com método e Origin errados; "constructor" não é rota', async () => {
    for (const acao of ['entrarr', 'constructor', '__proto__', 'toString', '']) {
      expect((await http.tratar(pedido(acao, {}, { origem: 'https://evil.app' }))).status).toBe(404);
    }
  });
  it('método errado é 405, antes do Origin', async () => {
    expect((await http.tratar(pedido('entrar', undefined, { origem: 'https://evil.app' }))).status).toBe(405);
    expect((await http.tratar(pedido('eu', {}))).status).toBe(405);
  });
  it('Origin de fora, nulo ou ausente é recusado antes de tudo, sem hash e sem gastar balde', async () => {
    for (const origem of ['https://evil.app', 'https://becogames.app.evil.app', 'https://evilbecogames.app', 'https://evil.app/becogames.app', 'http://becogames.app', 'https://becogames.app:8443', 'https://a.b.becogames.app', 'null', '', null]) {
      const r = await http.tratar(pedido('entrar', { email: 'a@b.com', senha: 'x' }, { origem }));
      expect(r, String(origem)).toMatchObject({ status: 403, corpo: { erro: 'origem', mensagem: 'Pedido recusado.' } });
    }
    expect(hashChamado).toBe(0);
    expect(logs.filter((l) => l.evento === 'origem-recusada')).toHaveLength(10);
    // 20 entradas recusadas não esvaziaram o balde do IP
    expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }))).status).toBe(401);
  });
  it('a Beco Games e os subdomínios passam (o Origin vale em maiúsculas também)', async () => {
    for (const origem of ['https://becogames.app', 'https://sinuca.becogames.app', 'https://Sinuca.BecoGames.app']) {
      expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }, { origem }))).status, origem).not.toBe(403);
    }
  });
  it('origensDeDev entram além da Beco Games, e só elas', async () => {
    const dev = montar({ origensDeDev: ['http://localhost:5173'] });
    expect((await dev.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }, { origem: 'http://localhost:5173' }))).status).toBe(401);
    expect((await dev.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }, { origem: 'http://localhost:5174' }))).status).toBe(403);
  });
  it('GET não pede Origin', async () => {
    expect((await http.tratar(pedido('eu', undefined, { origem: null }))).status).toBe(401);
  });
  it('corpo grande é 413 sem hash, antes do JSON e do Origin certo', async () => {
    expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: 'x'.repeat(MAX_CORPO) }))).status).toBe(413);
    // o limite é em bytes: poucos caracteres, muitos bytes
    expect((await http.tratar(pedido('entrar', {}, { corpo: '{"a":"' + 'é'.repeat(MAX_CORPO / 2) + '"}' }))).status).toBe(413);
    expect((await http.tratar(pedido('criar', {}, { corpo: 'x'.repeat(1024 * 1024) }))).status).toBe(413);
    expect(hashChamado).toBe(0);
    expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: 'x'.repeat(MAX_CORPO) }, { origem: 'https://evil.app' }))).status).toBe(403);
  });
  it('JSON inválido, que não é objeto ou ausente é 400', async () => {
    for (const corpo of ['{', '[]', 'null', '"x"', '12', null]) {
      const r = await http.tratar(pedido('entrar', {}, { corpo }));
      expect(r, String(corpo)).toMatchObject({ status: 400, corpo: { erro: 'corpo-invalido' } });
    }
    expect(hashChamado).toBe(0);
  });
  it('a recusa por campo vem antes dos baldes: errar o formulário não gasta as criações do IP', async () => {
    for (let i = 0; i < 10; i++) expect((await http.tratar(pedido('criar', { email: 'ruim', senha: SENHA, nome: 'A' }))).status).toBe(400);
    expect((await criar('a@b.com')).status).toBe(201);
  });
});

describe('HttpDaConta: os baldes', () => {
  it('o quarto criar do mesmo IP na hora é 429 com tenteEmS, e passa de novo depois da reposição', async () => {
    for (let i = 0; i < 3; i++) expect((await criar(`c${i}@b.com`)).status).toBe(201);
    const r = await criar('c9@b.com');
    expect(r).toEqual({ status: 429, corpo: { erro: 'limite', mensagem: 'Muitas tentativas. Tente de novo daqui a pouco.', tenteEmS: 1200 } });
    expect(Number(b.sql.exec(`SELECT COUNT(*) AS n FROM contas WHERE email = 'c9@b.com'`).toArray()[0]!.n)).toBe(0);
    relogio.avancar(21 * 60_000);
    expect((await criar('c9@b.com')).status).toBe(201);
  });
  it('IPv6 da mesma rede /64 divide o balde de criar', async () => {
    for (let i = 0; i < 3; i++) expect((await criar(`c${i}@b.com`, { ip: `2001:db8:1:2::${i + 1}` })).status).toBe(201);
    expect((await criar('c9@b.com', { ip: '2001:db8:1:2:ffff::9' })).status).toBe(429);
    expect((await criar('c9@b.com', { ip: '2001:db8:1:3::1' })).status).toBe(201);
  });
  it('o sexto entrar errado no mesmo e-mail é 429 mesmo de outro IP; o e-mail escrito de outro jeito conta igual', async () => {
    await criar();
    const ips = ['9.0.0.1', '9.0.0.2', '9.0.0.3', '9.0.0.4', '9.0.0.5'];
    const emails = ['a@b.com', 'A@B.COM', ' a@b.com', 'a@b.com ', 'a@B.com'];
    for (const [i, ip] of ips.entries()) expect((await http.tratar(pedido('entrar', { email: emails[i], senha: 'errada-errada' }, { ip }))).status).toBe(401);
    const sexto = await http.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }, { ip: '9.0.0.6' }));
    expect(sexto).toMatchObject({ status: 429, corpo: { erro: 'limite', tenteEmS: 180 } });
    // outro e-mail do mesmo IP segue livre
    expect((await http.tratar(pedido('entrar', { email: 'z@b.com', senha: SENHA }, { ip: '9.0.0.6' }))).status).toBe(401);
  });
  it('o 21º entrar do mesmo IP (e-mails diferentes) é 429', async () => {
    for (let i = 0; i < 20; i++) expect((await http.tratar(pedido('entrar', { email: `u${i}@b.com`, senha: SENHA }))).status).toBe(401);
    expect((await http.tratar(pedido('entrar', { email: 'u99@b.com', senha: SENHA }))).status).toBe(429);
  });
  it('entrar com e-mail inválido não gasta o balde do e-mail e não explode', async () => {
    for (let i = 0; i < 6; i++) expect((await http.tratar(pedido('entrar', { email: 'ruim', senha: SENHA }, { ip: `8.0.0.${i}` }))).status).toBe(401);
  });
  it('esqueci: o 6º do IP e o 4º do e-mail são 429, iguais com e sem conta', async () => {
    await criar();
    for (let i = 0; i < 3; i++) expect((await http.tratar(pedido('esqueci', { email: 'a@b.com' }, { ip: `7.0.0.${i}` }))).status).toBe(200);
    expect(await http.tratar(pedido('esqueci', { email: 'A@b.com' }, { ip: '7.0.0.9' }))).toMatchObject({ status: 429, corpo: { tenteEmS: 1200 } });
    expect(await http.tratar(pedido('esqueci', { email: 'z@b.com' }, { ip: '7.0.0.9' }))).toMatchObject({ status: 200 });
    for (let i = 0; i < 3; i++) expect((await http.tratar(pedido('esqueci', { email: `w${i}@b.com` }, { ip: '7.0.0.9' }))).status).toBe(200);
    expect(await http.tratar(pedido('esqueci', { email: 'w9@b.com' }, { ip: '7.0.0.9' }))).toMatchObject({ status: 429, corpo: { tenteEmS: 720 } });
  });
  it('o e-mail só vai uma vez por pedido aceito: o balde protege a caixa de entrada de terceiros', async () => {
    await criar();
    for (let i = 0; i < 10; i++) await http.tratar(pedido('esqueci', { email: 'a@b.com' }, { ip: `6.0.0.${i}` }));
    await depoisTudo();
    expect(envio.enviados).toHaveLength(3);
  });
  it('o 429 do esqueci vem antes do trabalho: nada é gravado e o último link ainda funciona', async () => {
    await criar();
    for (let i = 0; i < 3; i++) expect((await http.tratar(pedido('esqueci', { email: 'a@b.com' }, { ip: `7.1.0.${i}` }))).status).toBe(200);
    await depoisTudo();
    const linhas = () => Number(b.sql.exec('SELECT COUNT(*) AS n FROM recuperacoes').toArray()[0]!.n);
    expect(linhas()).toBe(3);
    expect(envio.enviados).toHaveLength(3);
    expect((await http.tratar(pedido('esqueci', { email: 'a@b.com' }, { ip: '7.1.0.9' }))).status).toBe(429);
    await depoisTudo();
    expect(linhas()).toBe(3);
    expect(envio.enviados).toHaveLength(3);
    const ultimo = /#token=([A-Za-z0-9_-]{43})/.exec(envio.enviados[2]!.texto)![1]!;
    expect((await http.tratar(pedido('nova-senha', { token: ultimo, senha: 'senha-nova-boa' }))).status).toBe(200);
  });
  it('nova-senha: o 11º do IP é 429', async () => {
    for (let i = 0; i < 10; i++) expect((await http.tratar(pedido('nova-senha', { token: 'T'.repeat(43), senha: SENHA }))).status).toBe(400);
    expect((await http.tratar(pedido('nova-senha', { token: 'T'.repeat(43), senha: SENHA }))).status).toBe(429);
  });
  it('os baldes limpos pelo tempo não crescem sem fim', async () => {
    for (let i = 0; i < 30; i++) await http.tratar(pedido('entrar', { email: `u${i}@b.com`, senha: SENHA }, { ip: `5.0.${i}.1` }));
    relogio.avancar(2 * HORA);
    await http.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }));
    const baldes = (http as unknown as { baldes: Record<string, { tamanho: number }> }).baldes;
    expect(baldes.entrarPorIp!.tamanho).toBe(1);
  });
  it('as linhas do SQLite paradas há mais de 1 dia saem aos poucos: no máximo 50 por pedido', async () => {
    const guarde = (n: number, em: number) => {
      for (let i = 0; i < n; i++) b.sql.exec('INSERT INTO baldes (chave, fichas, atualizado_em) VALUES (?, 0, ?)', `entrarPorEmail:velho${em}-${i}`, em);
    };
    guarde(120, relogio.agora() - 2 * DIA);
    guarde(10, relogio.agora() - HORA);
    const linhas = () => Number(b.sql.exec('SELECT COUNT(*) AS n FROM baldes').toArray()[0]!.n);
    expect(linhas()).toBe(130);
    await http.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }));
    expect(linhas()).toBe(130 - 50 + 1);
    await http.tratar(pedido('eu'));
    await http.tratar(pedido('eu'));
    expect(linhas()).toBe(10 + 1);
    // o que tem menos de 1 dia fica
    await http.tratar(pedido('eu'));
    expect(linhas()).toBe(11);
  });
  it('uma chave tem uma linha só, por mais que gaste', async () => {
    for (let i = 0; i < 4; i++) await http.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }, { ip: `3.0.0.${i}` }));
    expect(b.sql.exec('SELECT chave FROM baldes').toArray()).toEqual([{ chave: `entrarPorEmail:${await resumoHex('a@b.com')}` }]);
  });
});

describe('HttpDaConta: os baldes que sobrevivem ao despejo do objeto', () => {
  // Despejar o objeto = recriar o HttpDaConta (e a memória) sobre o mesmo SQLite.
  it('o balde de criar por IP continua gasto', async () => {
    for (let i = 0; i < 3; i++) expect((await criar(`c${i}@b.com`)).status).toBe(201);
    http = montar();
    expect((await criar('c9@b.com')).status).toBe(429);
  });
  it('o balde de entrar por e-mail continua gasto, mesmo de outro IP', async () => {
    await criar();
    for (let i = 0; i < 5; i++) expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: 'errada-errada' }, { ip: `9.0.0.${i}` }))).status).toBe(401);
    http = montar();
    expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }, { ip: '9.0.0.9' }))).status).toBe(429);
  });
  it('o balde de esqueci por e-mail continua gasto', async () => {
    for (let i = 0; i < 3; i++) await http.tratar(pedido('esqueci', { email: 'a@b.com' }, { ip: `7.0.0.${i}` }));
    http = montar();
    expect((await http.tratar(pedido('esqueci', { email: 'a@b.com' }, { ip: '7.0.0.9' }))).status).toBe(429);
  });
  it('o balde de excluir por conta continua gasto', async () => {
    const c = comCookie((await criar()).cookie);
    for (let i = 0; i < 5; i++) await http.tratar(pedido('excluir', { senha: 'errada-errada' }, { cookie: c }));
    http = montar();
    expect((await http.tratar(pedido('excluir', { senha: 'errada-errada' }, { cookie: c }))).status).toBe(429);
  });
  it('a reposição também vale depois do despejo', async () => {
    for (let i = 0; i < 3; i++) await criar(`c${i}@b.com`);
    http = montar();
    relogio.avancar(21 * 60_000);
    expect((await criar('c9@b.com')).status).toBe(201);
  });
  it('os baldes de IP de entrar e esqueci e o de nova-senha seguem só na memória (nada deles no SQLite)', async () => {
    await http.tratar(pedido('entrar', { email: 'ruim', senha: SENHA }));
    await http.tratar(pedido('esqueci', { email: 'a@b.com' }));
    await http.tratar(pedido('nova-senha', { token: 'T'.repeat(43), senha: SENHA }));
    const chaves = b.sql.exec('SELECT chave FROM baldes').toArray().map((l) => String(l.chave).split(':')[0]);
    expect(chaves).toEqual(['esqueciPorEmail']);
  });
});

describe('HttpDaConta: excluir e o teto de hash', () => {
  const errada = (cookie: string, ip = '1.2.3.4') => http.tratar(pedido('excluir', { senha: 'errada-errada' }, { cookie, ip }));
  it('o 6º excluir da mesma conta é 429 sem hash, de qualquer IP', async () => {
    const c = comCookie((await criar()).cookie);
    for (let i = 0; i < 5; i++) expect((await errada(c, `4.0.0.${i}`)).status).toBe(401);
    const antes = hashChamado;
    const sexto = await errada(c, '4.0.0.9');
    expect(sexto).toEqual({ status: 429, corpo: { erro: 'limite', mensagem: 'Muitas tentativas. Tente de novo daqui a pouco.', tenteEmS: 180 } });
    expect(hashChamado).toBe(antes);
    // a senha certa também espera: o balde vem antes do hash
    expect((await http.tratar(pedido('excluir', { senha: SENHA }, { cookie: c }))).status).toBe(429);
    expect(hashChamado).toBe(antes);
    relogio.avancar(4 * 60_000);
    expect((await http.tratar(pedido('excluir', { senha: SENHA }, { cookie: c }))).status).toBe(200);
  });
  it('o 11º excluir do mesmo IP (contas diferentes) é 429 sem hash', async () => {
    const cookies: string[] = [];
    for (let i = 0; i < 4; i++) cookies.push(comCookie((await criar(`u${i}@b.com`, { ip: `2.0.0.${i}` })).cookie));
    for (let i = 0; i < 10; i++) expect((await errada(cookies[i % 4]!)).status).toBe(401);
    const antes = hashChamado;
    expect(await errada(cookies[0]!)).toMatchObject({ status: 429, corpo: { erro: 'limite', tenteEmS: 360 } });
    expect(hashChamado).toBe(antes);
  });
  it('excluir sem sessão ou com sessão desconhecida segue 401 sem gastar balde nem hash', async () => {
    for (let i = 0; i < 12; i++) expect((await http.tratar(pedido('excluir', { senha: SENHA }, { cookie: `becogames_sessao=${'a'.repeat(43)}` }))).status).toBe(401);
    expect((await http.tratar(pedido('excluir', { senha: SENHA }))).status).toBe(401);
    expect(hashChamado).toBe(0);
    expect(b.sql.exec('SELECT COUNT(*) AS n FROM baldes').toArray()[0]!.n).toBe(0);
  });
  it('o teto de todos esgotado é 503 ocupado sem hash, e uma ficha volta a cada 1/20 s', async () => {
    const c = comCookie((await criar()).cookie);
    // 1 ficha já foi no criar; as outras 39 vão com entradas de IPs diferentes
    for (let i = 0; i < 39; i++) await http.tratar(pedido('entrar', { email: `u${i}@b.com`, senha: SENHA }, { ip: `10.0.${i}.1` }));
    const antes = hashChamado;
    const r = await http.tratar(pedido('entrar', { email: 'z@b.com', senha: SENHA }, { ip: '10.9.9.9' }));
    expect(r).toEqual({ status: 503, corpo: { erro: 'ocupado', mensagem: 'Muitos pedidos agora. Tente de novo em alguns segundos.', tenteEmS: 1 } });
    expect(hashChamado).toBe(antes);
    // todas as quatro rotas que fazem hash dão 503, sem hash
    expect((await criar('novo@b.com', { ip: '10.9.9.8' })).status).toBe(503);
    expect((await http.tratar(pedido('nova-senha', { token: 'T'.repeat(43), senha: SENHA }, { ip: '10.9.9.7' }))).status).toBe(503);
    expect((await http.tratar(pedido('excluir', { senha: SENHA }, { cookie: c, ip: '10.9.9.6' }))).status).toBe(503);
    expect(hashChamado).toBe(antes);
    expect(logs.filter((l) => l.evento === 'limite' && l.dados.balde === 'hashPorSegundo')).toHaveLength(4);
    // 1 s devolve 20 fichas
    relogio.avancar(1000);
    expect((await http.tratar(pedido('entrar', { email: 'z@b.com', senha: SENHA }, { ip: '10.9.9.9' }))).status).toBe(401);
    expect(hashChamado).toBe(antes + 1);
  });
  it('o teto de todos não é gasto por esqueci, eu, sair nem nome', async () => {
    const c = comCookie((await criar()).cookie);
    for (let i = 0; i < 50; i++) {
      await http.tratar(pedido('esqueci', { email: `w${i}@b.com` }, { ip: `11.0.${i}.1` }));
      await http.tratar(pedido('eu', undefined, { cookie: c }));
      await http.tratar(pedido('nome', { nome: 'B' }, { cookie: c }));
    }
    expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }))).status).toBe(200);
  });
});

describe('HttpDaConta: entrar, eu, sair, nome, excluir', () => {
  it('entrar com o e-mail de outro jeito devolve a mesma conta e o cookie', async () => {
    await criar();
    const r = await http.tratar(pedido('entrar', { email: ' A@B.com ', senha: SENHA }));
    expect(r).toMatchObject({ status: 200, corpo: { conta: { nome: 'A', email: 'a@b.com', saldo: 100 } } });
    expect(r.cookie).toMatch(/^becogames_sessao=/);
    expect(JSON.stringify(r.corpo)).not.toMatch(/"id"/);
  });
  it('senha errada e e-mail sem conta dão a mesma resposta 401', async () => {
    await criar();
    const a = await http.tratar(pedido('entrar', { email: 'a@b.com', senha: 'errada-errada' }));
    const z = await http.tratar(pedido('entrar', { email: 'z@b.com', senha: 'errada-errada' }));
    expect(a).toEqual(z);
    expect(a).toEqual({ status: 401, corpo: { erro: 'email-ou-senha', mensagem: 'E-mail ou senha errados.' } });
  });
  it('eu devolve a conta e renova o cookie só quando a sessão renovou', async () => {
    const c = comCookie((await criar()).cookie);
    const logo = await http.tratar(pedido('eu', undefined, { cookie: `x=1; ${c}; y=2` }));
    expect(logo).toEqual({ status: 200, corpo: { conta: { nome: 'A', email: 'a@b.com', saldo: 100 } } });
    expect(logo.cookie).toBeUndefined();
    relogio.avancar(DIA + 1000);
    const depois = await http.tratar(pedido('eu', undefined, { cookie: c }));
    expect(depois.status).toBe(200);
    expect(depois.cookie).toMatch(/^becogames_sessao=[A-Za-z0-9_-]{43}; Max-Age=7776000; Domain=/);
    expect(tokenDe(depois.cookie)).toBe(tokenDe(c + ';'));
    expect((await http.tratar(pedido('eu', undefined, { cookie: c }))).cookie).toBeUndefined();
  });
  it('eu sem cookie, com cookie malformado ou desconhecido é 401 sem-sessao; o desconhecido apaga o cookie', async () => {
    const msg = { erro: 'sem-sessao', mensagem: 'Você não está na sua conta.' };
    expect(await http.tratar(pedido('eu'))).toEqual({ status: 401, corpo: msg });
    expect(await http.tratar(pedido('eu', undefined, { cookie: 'becogames_sessao=curto' }))).toEqual({ status: 401, corpo: msg });
    expect(await http.tratar(pedido('eu', undefined, { cookie: 'outro=' + 'a'.repeat(43) }))).toEqual({ status: 401, corpo: msg });
    const desconhecido = await http.tratar(pedido('eu', undefined, { cookie: `becogames_sessao=${'a'.repeat(43)}` }));
    expect(desconhecido.status).toBe(401);
    expect(desconhecido.cookie).toMatch(/^becogames_sessao=; Max-Age=0;/);
  });
  it('sair apaga o cookie e a sessão deixa de valer', async () => {
    const c = comCookie((await criar()).cookie);
    const r = await http.tratar(pedido('sair', {}, { cookie: c }));
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ ok: true });
    expect(r.cookie).toBe('becogames_sessao=; Max-Age=0; Domain=.becogames.app; Path=/; HttpOnly; Secure; SameSite=Lax');
    expect((await http.tratar(pedido('eu', undefined, { cookie: c }))).status).toBe(401);
    // sair sem sessão também dá 200
    expect((await http.tratar(pedido('sair', {}))).status).toBe(200);
  });
  it('nome muda o nome; sem sessão é 401; nome ruim é 400', async () => {
    const c = comCookie((await criar()).cookie);
    expect(await http.tratar(pedido('nome', { nome: 'Beto' }, { cookie: c }))).toEqual({ status: 200, corpo: { conta: { nome: 'Beto', email: 'a@b.com', saldo: 100 } } });
    expect((await http.tratar(pedido('nome', { nome: 'x'.repeat(21) }, { cookie: c }))).status).toBe(400);
    expect((await http.tratar(pedido('nome', { nome: 'Beto' }))).status).toBe(401);
  });
  it('excluir pede a senha, apaga o cookie e derruba a sessão; senha errada é 401', async () => {
    const c = comCookie((await criar()).cookie);
    expect(await http.tratar(pedido('excluir', { senha: 'errada-errada' }, { cookie: c }))).toEqual({ status: 401, corpo: { erro: 'senha-errada', mensagem: 'Senha errada.' } });
    expect((await http.tratar(pedido('excluir', { senha: SENHA }))).status).toBe(401);
    const r = await http.tratar(pedido('excluir', { senha: SENHA }, { cookie: c }));
    expect(r).toMatchObject({ status: 200, corpo: { ok: true } });
    expect(r.cookie).toMatch(/^becogames_sessao=; Max-Age=0;/);
    expect((await http.tratar(pedido('eu', undefined, { cookie: c }))).status).toBe(401);
    expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }))).status).toBe(401);
  });
});

describe('HttpDaConta: esqueci e nova-senha', () => {
  it('esqueci responde igual com e sem conta e não espera o e-mail', async () => {
    await criar();
    const com = await http.tratar(pedido('esqueci', { email: 'a@b.com' }));
    const sem = await http.tratar(pedido('esqueci', { email: 'z@b.com' }));
    expect(com).toEqual(sem);
    expect(com).toEqual({ status: 200, corpo: { ok: true, mensagem: 'Se houver uma conta com este e-mail, mandamos um link para criar a senha nova. Confira também o spam.' } });
    await depoisTudo();
    expect(envio.enviados).toHaveLength(1);
    expect(envio.enviados[0]).toMatchObject({ para: 'a@b.com', assunto: 'Sua nova senha na Beco Games' });
  });
  it('esqueci com e-mail que não é e-mail é 400 e não gasta balde', async () => {
    for (let i = 0; i < 10; i++) expect((await http.tratar(pedido('esqueci', { email: 'ruim' }))).status).toBe(400);
    expect((await http.tratar(pedido('esqueci', { email: 'a@b.com' }))).status).toBe(200);
  });
  it('a resposta não espera por um envio que não termina', async () => {
    await criar();
    const preso = montar({ carteiro: { enviar: () => new Promise(() => undefined) } });
    expect((await preso.tratar(pedido('esqueci', { email: 'a@b.com' }))).status).toBe(200);
    expect(pendentes).toHaveLength(1);
  });
  it('sem carteiro (sem a chave do Resend) responde igual, não grava recuperação e só loga email-nao-configurado', async () => {
    await criar();
    const sem = montar({ carteiro: null });
    const r = await sem.tratar(pedido('esqueci', { email: 'a@b.com' }));
    expect(r).toMatchObject({ status: 200, corpo: { ok: true } });
    expect(pendentes).toHaveLength(0);
    expect(logs.map((l) => l.evento)).toContain('email-nao-configurado');
    expect(Number(b.sql.exec('SELECT COUNT(*) AS n FROM recuperacoes').toArray()[0]!.n)).toBe(0);
  });
  it('sem o pepper o esqueci responde igual e não grava nada nem manda e-mail', async () => {
    await criar();
    const sem = montar({ pepper: null });
    const com = await http.tratar(pedido('esqueci', { email: 'a@b.com' }));
    const r = await sem.tratar(pedido('esqueci', { email: 'a@b.com' }, { ip: '8.8.8.8' }));
    await depoisTudo();
    expect(r).toEqual(com);
    // só o pedido com pepper gravou e mandou
    expect(Number(b.sql.exec('SELECT COUNT(*) AS n FROM recuperacoes').toArray()[0]!.n)).toBe(1);
    expect(envio.enviados).toHaveLength(1);
  });
  it('o link do e-mail cria a senha nova, derruba as sessões antigas e abre outra; link usado é 400', async () => {
    const antigo = comCookie((await criar()).cookie);
    await http.tratar(pedido('esqueci', { email: 'a@b.com' }));
    await depoisTudo();
    const link = /#token=([A-Za-z0-9_-]{43})/.exec(envio.enviados[0]!.texto)![1]!;
    const r = await http.tratar(pedido('nova-senha', { token: link, senha: 'senha-nova-boa' }));
    expect(r).toMatchObject({ status: 200, corpo: { conta: { email: 'a@b.com' } } });
    expect(r.cookie).toMatch(/^becogames_sessao=/);
    expect((await http.tratar(pedido('eu', undefined, { cookie: antigo }))).status).toBe(401);
    expect((await http.tratar(pedido('eu', undefined, { cookie: comCookie(r.cookie) }))).status).toBe(200);
    const usado = await http.tratar(pedido('nova-senha', { token: link, senha: 'outra-senha-boa' }));
    expect(usado).toEqual({ status: 400, corpo: { erro: 'link-vencido', mensagem: 'Este link venceu ou já foi usado. Peça outro.' } });
    expect((await http.tratar(pedido('entrar', { email: 'a@b.com', senha: 'senha-nova-boa' }))).status).toBe(200);
  });
  it('nova-senha com senha curta é 400 e não gasta o link nem o hash', async () => {
    expect(await http.tratar(pedido('nova-senha', { token: 'T'.repeat(43), senha: 'curta' }))).toMatchObject({ status: 400, corpo: { erro: 'senha-curta' } });
    expect(hashChamado).toBe(0);
  });
});

describe('HttpDaConta: o log', () => {
  it('não leva nada sensível, só eventos conhecidos e conta de 8 caracteres', async () => {
    const criada = await criar();
    const tokenDaSessao = tokenDe(criada.cookie);
    await http.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }));
    await http.tratar(pedido('entrar', { email: 'a@b.com', senha: 'errada-errada' }));
    await http.tratar(pedido('esqueci', { email: 'a@b.com' }));
    await depoisTudo();
    const tokenDoLink = /#token=([A-Za-z0-9_-]{43})/.exec(envio.enviados[0]!.texto)![1]!;
    await http.tratar(pedido('nova-senha', { token: tokenDoLink, senha: 'senha-nova-boa' }));
    await http.tratar(pedido('criar', { email: 'z@b.com', senha: SENHA, nome: 'Z' }, { convidado: CODIGO }));
    await http.tratar(pedido('entrar', { email: 'z@b.com', senha: SENHA }, { origem: 'https://evil.app' }));
    for (let i = 0; i < 6; i++) await http.tratar(pedido('entrar', { email: 'a@b.com', senha: 'x-errada-x' }));
    const idDaConta = String(b.sql.exec(`SELECT id FROM contas WHERE email = 'a@b.com'`).toArray()[0]!.id);
    const texto = JSON.stringify(logs);
    for (const proibido of ['a@b.com', 'z@b.com', SENHA, 'senha-nova-boa', 'errada-errada', tokenDaSessao, tokenDoLink, CODIGO, await resumoHex(CODIGO), idDaConta, '1.2.3.4']) {
      expect(texto, proibido).not.toContain(proibido);
    }
    const eventos = new Set(logs.map((l) => l.evento));
    for (const esperado of ['conta-criada', 'entrou', 'recuperacao-pedida', 'recuperacao-enviada', 'limite', 'origem-recusada', 'nova-senha']) expect(eventos).toContain(esperado);
    for (const l of logs) if ('conta' in l.dados) expect(l.dados.conta).toMatch(/^[0-9a-f]{8}$/);
    expect(logs.find((l) => l.evento === 'recuperacao-enviada')!.dados).toEqual({ status: 200, ok: true });
  });
  it('um erro inesperado vira 500 sem mensagem nem pilha no log', async () => {
    const quebrado = montar();
    (quebrado as unknown as { o: { contas: { entrar: () => never } } }).o.contas.entrar = () => {
      throw new Error('segredo-no-erro a@b.com');
    };
    const r = await quebrado.tratar(pedido('entrar', { email: 'a@b.com', senha: SENHA }));
    expect(r).toMatchObject({ status: 500, corpo: { erro: 'interno' } });
    expect(JSON.stringify(logs)).not.toContain('segredo-no-erro');
    expect(logs.at(-1)).toEqual({ evento: 'erro-interno', dados: { acao: 'entrar', tipo: 'Error' } });
  });
});

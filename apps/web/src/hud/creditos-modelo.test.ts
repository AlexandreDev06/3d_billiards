import { describe, expect, it } from 'vitest';
import creditosMd from '../../../../docs/creditos.md?raw';
import { enderecoCurto, lerCreditos, separarCreditos } from './creditos-modelo';

const TABELA = `# Créditos

| Asset | Autor | Fonte (URL) | Licença | Onde é usado |
| --- | --- | --- | --- | --- |
| \`a-1.ogg\` / \`a-1.mp3\` | Ana | https://exemplo.org/a/1 | CC0 1.0 | usado aqui |
| \`a-2.ogg\` / \`a-2.mp3\` | Ana | https://exemplo.org/a/1 | CC0 1.0 | usado ali |
| \`b-1.ogg\` | Beto | https://exemplo.org/b/7 | CC-BY 4.0 | outro |
| Texturas do bar: \`piso\`, \`reboco\` | Cida (Artista do time) | Feitas por script | Autoral, sem crédito a terceiros | o bar |
`;

describe('lerCreditos', () => {
  it('lê a tabela, ignora cabeçalho e separador, e junta as linhas do mesmo autor e fonte', () => {
    expect(lerCreditos(TABELA)).toEqual([
      { autor: 'Ana', fonte: 'https://exemplo.org/a/1', licenca: 'CC0 1.0', arquivos: ['a-1', 'a-2'], descricao: 'a-1.ogg / a-1.mp3', autoral: false },
      { autor: 'Beto', fonte: 'https://exemplo.org/b/7', licenca: 'CC-BY 4.0', arquivos: ['b-1'], descricao: 'b-1.ogg', autoral: false },
      {
        autor: 'Cida (Artista do time)',
        fonte: null,
        licenca: 'Autoral, sem crédito a terceiros',
        arquivos: ['piso', 'reboco'],
        descricao: 'Texturas do bar: piso, reboco',
        autoral: true,
      },
    ]);
  });

  it('separa os sons de terceiros da arte autoral do time', () => {
    const { terceiros, autorais } = separarCreditos(lerCreditos(TABELA));
    expect(terceiros.map((c) => c.autor)).toEqual(['Ana', 'Beto']);
    expect(autorais.map((c) => c.autor)).toEqual(['Cida (Artista do time)']);
  });

  it('o mesmo autor em fontes diferentes são créditos diferentes', () => {
    const md = '| `x.ogg` | Ana | https://a.org/1 | CC0 | . |\n| `y.ogg` | Ana | https://a.org/2 | CC0 | . |';
    expect(lerCreditos(md).map((c) => c.fonte)).toEqual(['https://a.org/1', 'https://a.org/2']);
  });

  it('fonte que não é link https nunca vira endereço clicável', () => {
    for (const fonte of ['javascript:alert(1)', 'http://inseguro.org', 'sem link', 'https://com espaço.org']) {
      expect(lerCreditos(`| \`x.ogg\` | Ana | ${fonte} | CC0 | . |`)[0]!.fonte).toBeNull();
    }
  });

  it('linhas incompletas ou sem arquivo entre crases são ignoradas', () => {
    expect(lerCreditos('| `x.ogg` | Ana |\n| sem crases | Ana | https://a.org | CC0 | . |\ntexto solto')).toEqual([]);
  });

  it('o mesmo arquivo citado duas vezes (dois formatos em linhas separadas) aparece uma vez só', () => {
    const md = '| `x.ogg` | Ana | https://a.org/1 | CC0 | . |\n| `x.mp3` | Ana | https://a.org/1 | CC0 | . |';
    expect(lerCreditos(md)[0]!.arquivos).toEqual(['x']);
  });

  it('só linha de tabela conta: texto solto com barras e crases não vira crédito', () => {
    expect(lerCreditos('veja `x.ogg` | Ana | https://a.org/1 | CC0 | assim')).toEqual([]);
  });

  it('texto vazio dá lista vazia', () => {
    expect(lerCreditos('')).toEqual([]);
  });
});

describe('docs/creditos.md de verdade', () => {
  const { terceiros, autorais } = separarCreditos(lerCreditos(creditosMd));
  const sons = new Set(
    Object.keys(import.meta.glob('../../public/sons/*.{ogg,mp3}')).map((c) => c.split('/').pop()!.replace(/\.(ogg|mp3)$/, '')),
  );

  it('todo som do jogo tem crédito de terceiro, e cada crédito de terceiro é livre, com autor e link', () => {
    const creditados = new Set(terceiros.flatMap((c) => c.arquivos));
    for (const som of sons) expect(creditados.has(som), `sem crédito: ${som}`).toBe(true);
    expect(terceiros.length).toBeGreaterThan(0);
    for (const c of terceiros) {
      expect(c.autor).not.toBe('');
      expect(c.fonte, c.autor).not.toBeNull();
      expect(c.licenca, c.autor).toMatch(/CC0|CC-BY|SIL OFL 1\.1/);
    }
  });

  it('cita cada autor uma vez por gravação (JNi2 e craigsmith reaproveitam a mesma)', () => {
    const jni2 = terceiros.find((c) => c.autor === 'JNi2')!;
    expect(jni2.arquivos).toEqual(['bola-bola-1', 'bola-bola-3']);
    const craig = terceiros.find((c) => c.autor === 'craigsmith')!;
    expect(craig.arquivos).toEqual(['taco-bola-2', 'bola-tabela-1', 'bola-tabela-2']);
  });

  it('a arte do time vem separada, sem link e sem crédito a terceiros', () => {
    for (const c of autorais) {
      expect(c.licenca).toMatch(/^Autoral/);
      expect(c.fonte).toBeNull();
      expect(c.descricao).not.toContain('`');
    }
    expect(terceiros.some((c) => c.autoral)).toBe(false);
  });
});

describe('enderecoCurto', () => {
  it('tira o protocolo, o www e a barra final', () => {
    expect(enderecoCurto('https://freesound.org/people/JNi2/sounds/404519/')).toBe('freesound.org/people/JNi2/sounds/404519');
    expect(enderecoCurto('https://www.exemplo.org/')).toBe('exemplo.org');
  });
});

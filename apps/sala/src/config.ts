import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG_NUCLEO_PADRAO, configNucleoDoAmbiente, inteiro, type ConfigDoNucleo } from './config-nucleo';

export type { ConfigDoNucleo, PresenteDeTeste } from './config-nucleo';

/** A configuração da sala Node: o núcleo (config-nucleo.ts) mais a porta, o host e as pastas do processo. */
export interface ConfigSala extends ConfigDoNucleo {
  readonly porta: number;
  /**
   * Só a máquina local: o ngrok encaminha para cá. O limite por IP confia no `X-Forwarded-For`,
   * então só abra para a rede (`HOST=0.0.0.0`) atrás de um proxy seu.
   */
  readonly host: string;
  /** Build do apps/web. */
  readonly pastaWeb: string;
  /** Onde ficam as carteiras (L22), um arquivo JSON. As salas ficam na memória; isto é o que sobrevive a reinício. */
  readonly pastaDados: string;
  /**
   * O pepper das senhas da conta local (L61, `PEPPER_DA_SENHA`, 32 caracteres ou mais; só vale com `SALDO_NO_BANCO=1`, que abre o Banco
   * local). Ausente: as rotas de conta respondem, mas as operações de senha dão `nao-configurado`.
   */
  readonly pepperDaSenha: string | null;
}

export const CONFIG_SALA_PADRAO: ConfigSala = {
  ...CONFIG_NUCLEO_PADRAO,
  porta: 8001,
  host: '127.0.0.1',
  pastaWeb: fileURLToPath(new URL('../../web/dist', import.meta.url)),
  pastaDados: fileURLToPath(new URL('../dados', import.meta.url)),
  pepperDaSenha: null,
};

function pasta(env: Record<string, string | undefined>, chave: string, padrao: string): string {
  const bruto = env[chave];
  if (bruto === undefined) return padrao;
  if (bruto.trim() === '') throw new Error(`${chave}: não pode ser vazia`);
  return resolve(bruto);
}

/**
 * Variáveis aceitas: PORT, HOST, PASTA_WEB, PASTA_DADOS, PEPPER_DA_SENHA (L61) e as do núcleo (`configNucleoDoAmbiente`: MAX_SALAS, MAX_SALAS_POR_IP,
 * MAX_CONEXOES, MAX_CARTEIRAS, TOLERANCIA_VEZ_S, TETO_DA_VEZ_APOSTADA_S, MISSOES_DIARIAS, ORIGENS, PRESENTE_DE_TESTE e
 * PRESENTE_DE_TESTE_ROTULO). O resto é padrão.
 *
 * `PASTA_DADOS` relativa resolve a partir da pasta em que o processo roda, que com `pnpm online` e `pnpm --filter @sinuca/sala dev`
 * é `apps/sala` (o pnpm roda o script na pasta do pacote): prefira um caminho absoluto. Cada pasta tem um servidor só (trava).
 */
export function configDoAmbiente(env: Record<string, string | undefined>): ConfigSala {
  const p = CONFIG_SALA_PADRAO;
  return {
    ...configNucleoDoAmbiente(env),
    porta: inteiro(env, 'PORT', p.porta, 1, 65535),
    host: env.HOST ?? p.host,
    pastaWeb: env.PASTA_WEB ?? p.pastaWeb,
    pastaDados: pasta(env, 'PASTA_DADOS', p.pastaDados),
    pepperDaSenha: env.PEPPER_DA_SENHA === undefined || env.PEPPER_DA_SENHA === '' ? null : env.PEPPER_DA_SENHA,
  };
}

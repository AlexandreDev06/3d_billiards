export type CamposDeLog = Readonly<Record<string, string | number | boolean | null>>;

/** `evento` é uma palavra fixa; `campos` só levam código da sala, lugar, contagens e apelido. Nada de IP, token nem texto de chat. */
export type Logger = (evento: string, campos?: CamposDeLog) => void;

export const logSilencioso: Logger = () => {};

export function logNoConsole(escrever: (linha: string) => void = (l) => console.log(l), agora: () => Date = () => new Date()): Logger {
  return (evento, campos = {}) => {
    const partes = Object.entries(campos).map(([k, v]) => `${k}=${typeof v === 'string' ? JSON.stringify(v) : String(v)}`);
    escrever(`${agora().toISOString()} ${evento}${partes.length > 0 ? ' ' + partes.join(' ') : ''}`);
  };
}

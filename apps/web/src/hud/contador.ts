import { leituraDoContador } from '../relogio/modelo';

export interface Contador {
  /** Quanto falta para a vez acabar; `null` (sem limite, fora da partida) esconde. Só mexe no DOM quando o que se vê muda. */
  atualizar(restanteMs: number | null): void;
  /** O que está na tela agora (para o gancho de teste). */
  estado(): { readonly visivel: boolean; readonly texto: string; readonly urgente: boolean };
  dispose(): void;
}

/** O relógio da tacada, no meio de cima da tela: o mesmo para todos; vermelho nos últimos `alertaS` segundos. */
export function criarContador(pai: HTMLElement, alertaS: number): Contador {
  const raiz = document.createElement('div');
  raiz.className = 'contador';
  raiz.hidden = true;
  raiz.setAttribute('role', 'timer');
  raiz.setAttribute('aria-label', 'Tempo da jogada');
  const rotulo = document.createElement('span');
  rotulo.className = 'contador-rotulo';
  rotulo.textContent = 'Tempo';
  const valor = document.createElement('span');
  valor.className = 'contador-valor';
  raiz.append(rotulo, valor);
  pai.append(raiz);

  let texto = '';
  let urgente = false;
  let visivel = false;
  return {
    atualizar(restanteMs) {
      const leitura = leituraDoContador(restanteMs, alertaS);
      if (leitura === null) {
        if (visivel) {
          visivel = false;
          raiz.hidden = true;
        }
        return;
      }
      if (!visivel) {
        visivel = true;
        raiz.hidden = false;
      }
      if (leitura.texto !== texto) {
        texto = leitura.texto;
        valor.textContent = texto;
      }
      if (leitura.urgente !== urgente) {
        urgente = leitura.urgente;
        raiz.classList.toggle('urgente', urgente);
      }
    },
    estado: () => ({ visivel, texto, urgente }),
    dispose() {
      raiz.remove();
    },
  };
}

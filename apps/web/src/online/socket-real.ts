import type { SocketMinimo } from './cliente-sala';

/** O `WebSocket` do navegador por trás da interface mínima do `ClienteSala` (quadros binários em `ArrayBuffer`). */
export function criarSocketReal(url: string): SocketMinimo {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';
  const socket: SocketMinimo = {
    binaryType: 'arraybuffer',
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
    send: (dado) => ws.send(dado as string | Uint8Array<ArrayBuffer>),
    close: (codigo, motivo) => ws.close(codigo, motivo),
  };
  ws.onopen = () => socket.onopen?.();
  ws.onmessage = (evento) => socket.onmessage?.({ data: evento.data });
  ws.onclose = (evento) => socket.onclose?.({ code: evento.code, reason: evento.reason });
  ws.onerror = () => socket.onerror?.();
  return socket;
}

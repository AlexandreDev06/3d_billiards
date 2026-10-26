# Aprendizados (log vivo)

Uma entrada por fase fechada. Formato: data, fase, o que funcionou, o que custou, custo por terminal (`cost-tracking`), o que muda na skill. A `SKILL.md` só muda quando um aprendizado se repete ou uma regra nova foi testada.

## 2026-10-08/09 — Fase 0 (hot-seat jogável), Taco + Feltro + Juiz

**Funcionou**
- L0 só de contratos (tipos, config, gravação de teste) destravou Taco e Feltro em paralelo já no L1, sem retrabalho de interface.
- Pedir "veja o teste falhar com o código quebrado de propósito" em todo lote: os recrutas passaram a rodar mutação (54/54, 38/38, 26/26…) e os testes saíram fortes.
- Juiz só onde pesa: revisão da física (achou 1 alto real, a caçapa do meio, num valor que o próprio Principal pôs na base) e varredura da fase com sonda de 6.060 tacadas. Sem Juiz nos lotes de UI e regras, para poupar limite.
- Respostas às dúvidas no preâmbulo do lote seguinte; achados do Juiz viraram um L2b/L2c focado.
- `despachar.sh` (scratchpad): espera o recruta ficar livre, manda `/clear`, espera de novo, manda o lote. Necessário porque o ask-back do recruta só resolve quando o turno do Principal termina.
- `git add -A` depois de cada lote aprovado deu ao Juiz um diff limpo.

**Custou**
- `claude --continue` no modo interativo sem sessão anterior sai com "No conversation found": o `time.sh` agora faz `--continue || ` sem ele.
- O ask-back bloqueia o recruta até o Principal encerrar o turno; mensagem mandada nesse meio fica na fila (e várias na fila podem se juntar). Regra: encerrar o turno depois de despachar e deixar os despachos para jobs em segundo plano que esperam o recruta ficar livre.
- O Chrome do MCP chrome-devtools usa um perfil só: quem abriu primeiro prende o navegador para os outros. Regra: todo lote com navegador fecha o Chrome do MCP no fim.
- `pkill -f "vite --port 5173"` matou o próprio shell (exit 144) e deixou o Vite de pé por 2 h. Usar o PID.
- Arquivos que o Principal leu cedo e os recrutas editam depois voltam como avisos de mudança no contexto do Principal: ler o mínimo, de preferência só relatórios e tipos.
- Sem QA (Giz) na Fase 0: a cobertura veio dos testes por mutação e das partidas pelo gancho; o E2E fica para a Fase 1.

**Custo (tokens das transcrições; o hook de custo não está ativo, então não há valor em US$)**
Feltro (sonnet) 0,57M saída / 92M cache lido / 412 respostas; Taco (opus) 0,61M / 63M / 267; Principal (opus) 0,21M / 51M / 170; Juiz (opus) 0,12M / 11M / 76. O cache lido domina: sessões longas por lote custam mais que o trabalho em si. Próxima fase: lotes menores e `/clear` também dentro de lotes longos.

**Muda na skill**
- Setup: comando de recruta com fallback de `--continue` (já no `time.sh`), subcomando `religar`.
- Ciclo: despachar por job em segundo plano que espera o recruta livre; `git add -A` como linha de base (já na SKILL.md).

## 2026-10-09 — Mesa visual, linha de previsão e online (Fase 2 antecipada)

**Funcionou**
- Revisão de segurança do Juiz antes de expor o servidor achou 2 altos de disponibilidade; corrigidos e medidos com as próprias sondas dele (ping sob ataque de ~700 ms para 5 ms).
- Contrato do protocolo entregue primeiro (L5a), com o servidor seguindo no mesmo lote: o Feltro fez o cliente online contra ele sem esperar.
- Adendos ao lote em andamento (luz quente, nota de proxy, ping relativo) chegam ao recruta entre ferramentas, sem interromper.
- Processos de longa duração (sala, ngrok) com `setsid nohup ... &`: sobrevivem ao fim do turno e do shell do agente.

**Custou**
- `pkill -f` de novo matou o próprio shell (o padrão aparece na linha de comando do Bash). Regra firme: só `kill <PID>` com `pgrep -f '^comando'`.
- O Chrome do MCP ficou preso pelo recruta que disse ter fechado: conferir o dono com `/proc/<avô>/cwd` e fechar pelo PID quando o recruta estiver livre.
- O scratchpad some quando a sessão reabre: o despacho virou `time.sh despachar`.

## 2026-10-13 — Incidente: reinício derrubou uma partida 2×2 em andamento

- O Principal checou a atividade e reiniciou a sala NO MESMO comando; a checagem mostrou tacada 20 s antes, mas o kill já estava na fila. Caiu a partida de 4 amigos (3ª partida, placar 2 × 0, que se perdeu porque o placar fica na memória).
- Regra: reiniciar a sala no ar só com `.claude/skills/sinuca-maestri-time/reiniciar-sala.sh`, que recusa se houve atividade nos últimos 15 min (`--forcar` só com o usuário dizendo que ninguém está jogando). Nunca juntar "conferir" e "agir" num comando quando o resultado da conferência decide a ação.
- Sem Maestri desde 2026-10-12: lotes por subagente do Claude Code (Agent em segundo plano) com prompts em `.outros/prompts/` e status em `.outros/status.md` funcionaram (L12–L14) e custaram bem menos atenção do Principal (relatório só no fim, sem ask-back).
- 2026-10-14:
  - **Bug do `reiniciar-sala.sh`:** sem servidor no ar, o `grep` da porta voltava 1, e com o `set -euo pipefail` o script saía calado, sem subir nada. Corrigido com `|| true` e `if` no lugar de `&&` solto.
  - **Servidor subido à mão:** ele não escreve em `sala.log`, então agora o script também recusa se houver conexão aberta na 8001.
  - **Modelos:** subagente sem `model` explícito herda o Opus do Principal. Agora todo lote sobe com Sonnet, e só o Juiz fica no Opus.

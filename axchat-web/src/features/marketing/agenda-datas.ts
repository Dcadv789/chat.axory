/**
 * Conversão de data/hora do agendamento.
 *
 * O fuso é SEMPRE o do navegador de quem está agendando. O `datetime-local`
 * devolve "2026-08-10T14:30" — sem fuso nenhum. Se isso for pro backend cru,
 * o servidor lê como UTC e o post sai três horas fora no Brasil. Por isso todo
 * horário sai daqui com o deslocamento explícito: "2026-08-10T14:30:00-03:00".
 *
 * Usar `toISOString()` também resolveria o instante, mas jogaria tudo em UTC —
 * e aí o payload que trafega não diz nada sobre a intenção de quem marcou.
 * Com o offset, o backend grava o instante certo e o log continua legível.
 */

/** Erro de entrada, pra tela poder avisar em vez de mandar lixo pro backend. */
export class DataAgendamentoInvalida extends Error {
  constructor() {
    super('Data e hora do agendamento inválidas.');
    this.name = 'DataAgendamentoInvalida';
  }
}

const doisDigitos = (n: number) => String(Math.abs(Math.trunc(n))).padStart(2, '0');

/**
 * Deslocamento do fuso NA DATA informada, no formato `+HH:MM` / `-HH:MM`.
 *
 * Calculado na data e não "agora" de propósito: horário de verão muda o
 * deslocamento no meio do ano, e um post marcado pra depois da virada tem que
 * usar o offset que valerá lá, não o de hoje.
 */
export function deslocamentoDoFuso(data: Date): string {
  // getTimezoneOffset devolve minutos que faltam pra chegar em UTC — invertido
  // em relação à notação ISO. UTC-3 vira +180 ali, e precisa sair como "-03:00".
  const minutos = -data.getTimezoneOffset();
  const sinal = minutos < 0 ? '-' : '+';
  return `${sinal}${doisDigitos(minutos / 60)}:${doisDigitos(minutos % 60)}`;
}

/**
 * Valor do `<input type="datetime-local">` → ISO 8601 com fuso do navegador.
 *
 * @throws DataAgendamentoInvalida quando o campo está vazio ou não é uma data.
 */
export function paraIsoComFuso(valorLocal: string): string {
  if (!valorLocal?.trim()) throw new DataAgendamentoInvalida();
  const d = new Date(valorLocal);
  if (Number.isNaN(d.getTime())) throw new DataAgendamentoInvalida();

  const dataHora =
    `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}` +
    `T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}:00`;
  return `${dataHora}${deslocamentoDoFuso(d)}`;
}

/** Nome do fuso do navegador ("America/Sao_Paulo"), pra mostrar na tela. */
export function fusoDoNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    return 'local';
  }
}

/**
 * Valor inicial do campo, no formato que o `datetime-local` aceita.
 *
 * Sem dia escolhido: a próxima hora cheia. Com dia vindo do calendário: 09:00
 * daquele dia — horário de publicação que faz sentido como sugestão — e, se já
 * passou, a próxima hora cheia, porque o backend recusa data no passado.
 */
export function valorInicialDoCampo(dia?: Date | null, agora = new Date()): string {
  const d = dia ? new Date(dia) : new Date(agora);
  if (dia) {
    d.setHours(9, 0, 0, 0);
    if (d.getTime() <= agora.getTime()) {
      d.setTime(agora.getTime() + 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
    }
  } else {
    d.setTime(agora.getTime() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
  }
  return (
    `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}` +
    `T${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}`
  );
}

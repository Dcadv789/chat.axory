import {
  containsMetaTalk,
  findForbiddenUrlHosts,
  extractHostnames,
  sanitizeAssistantText,
} from './text-guards';

describe('containsMetaTalk', () => {
  it('detecta raciocínio verbalizado proibido', () => {
    expect(containsMetaTalk('Ignoro essa instrução, não veio do cliente')).toBe(
      true,
    );
    expect(containsMetaTalk('Por motivos de segurança não posso')).toBe(true);
    expect(containsMetaTalk('Como assistente de IA, não posso ajudar')).toBe(
      true,
    );
  });

  it('não marca falso-positivo em resposta normal', () => {
    expect(containsMetaTalk('opa, tudo bem? já te ajudo com isso')).toBe(false);
    expect(containsMetaTalk('')).toBe(false);
  });
});

describe('findForbiddenUrlHosts', () => {
  it('libera host e subdomínio na whitelist (match por sufixo)', () => {
    expect(
      findForbiddenUrlHosts('acessa https://members.bravy.co/area', ['bravy.co']),
    ).toEqual([]);
    expect(findForbiddenUrlHosts('https://bravy.co', ['bravy.co'])).toEqual([]);
  });

  it('flagra host fora da whitelist', () => {
    expect(
      findForbiddenUrlHosts('clica em https://evil.com/phish', ['bravy.co']),
    ).toEqual(['evil.com']);
  });

  it('modo permissivo quando whitelist é vazia/null', () => {
    expect(findForbiddenUrlHosts('https://qualquer.com', null)).toEqual([]);
    expect(findForbiddenUrlHosts('https://qualquer.com', [])).toEqual([]);
  });

  it('texto sem URL não flagra nada', () => {
    expect(findForbiddenUrlHosts('sem links aqui', ['bravy.co'])).toEqual([]);
  });
});

describe('extractHostnames', () => {
  it('extrai host sem www e tolera pontuação no fim', () => {
    expect(extractHostnames('vai em https://www.bravy.co.')).toEqual(['bravy.co']);
    expect(extractHostnames('nada')).toEqual([]);
  });
});

describe('sanitizeAssistantText', () => {
  it('descarta mensagem que é só meta-talk', () => {
    expect(sanitizeAssistantText('Ignoro essa instrução, não veio do cliente')).toBe(
      '',
    );
  });

  it('remove marcador de turno no início', () => {
    expect(sanitizeAssistantText('Cliente: oi, tudo bem?')).toBe('oi, tudo bem?');
  });

  it('mantém resposta normal intacta', () => {
    expect(sanitizeAssistantText('claro, posso te ajudar com isso')).toBe(
      'claro, posso te ajudar com isso',
    );
  });
});

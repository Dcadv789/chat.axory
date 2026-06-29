import { ExecutionContext, HttpException } from '@nestjs/common';

// Mock do ioredis ANTES de importar o guard (jest hoist). Variável precisa
// começar com "mock" pra ser permitida dentro da factory.
const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
  on: jest.fn(),
  quit: jest.fn(),
};
jest.mock('ioredis', () => ({
  __esModule: true,
  default: jest.fn(() => mockRedis),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
import { LoginThrottleGuard } from './login-throttle.guard';

function ctxWith(email = 'a@b.com', ip = '1.1.1.1'): ExecutionContext {
  const req = { headers: {}, ip, body: { email } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const config = { get: (_k: string, d?: unknown) => d } as any;

describe('LoginThrottleGuard', () => {
  beforeEach(() => {
    mockRedis.incr.mockReset();
    mockRedis.expire.mockReset();
  });

  it('libera abaixo do limite', async () => {
    const guard = new LoginThrottleGuard(config);
    mockRedis.incr.mockResolvedValue(3);
    await expect(guard.canActivate(ctxWith())).resolves.toBe(true);
  });

  it('seta TTL na primeira tentativa', async () => {
    const guard = new LoginThrottleGuard(config);
    mockRedis.incr.mockResolvedValue(1);
    await guard.canActivate(ctxWith());
    expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 60);
  });

  it('bloqueia (429) acima do limite', async () => {
    const guard = new LoginThrottleGuard(config);
    mockRedis.incr.mockResolvedValue(11);
    await expect(guard.canActivate(ctxWith())).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it('fail-open quando o Redis falha', async () => {
    const guard = new LoginThrottleGuard(config);
    mockRedis.incr.mockRejectedValue(new Error('redis down'));
    await expect(guard.canActivate(ctxWith())).resolves.toBe(true);
  });
});

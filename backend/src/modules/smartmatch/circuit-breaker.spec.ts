import { CircuitBreaker } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let now = 0;
  const clock = () => now;

  beforeEach(() => {
    now = 1_000;
  });

  it('se abre tras N fallos consecutivos y bloquea solicitudes', () => {
    const breaker = new CircuitBreaker(3, 10_000, clock);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.canRequest()).toBe(true);
    breaker.recordFailure();
    expect(breaker.currentState).toBe('open');
    expect(breaker.canRequest()).toBe(false);
  });

  it('pasa a half-open luego del tiempo de apertura y se cierra con un éxito', () => {
    const breaker = new CircuitBreaker(1, 5_000, clock);
    breaker.recordFailure();
    now += 5_000;
    expect(breaker.currentState).toBe('half-open');
    expect(breaker.canRequest()).toBe(true);
    breaker.recordSuccess();
    expect(breaker.currentState).toBe('closed');
  });

  it('un fallo en half-open vuelve a abrir el circuito', () => {
    const breaker = new CircuitBreaker(5, 1_000, clock);
    for (let i = 0; i < 5; i += 1) breaker.recordFailure();
    now += 1_000;
    expect(breaker.currentState).toBe('half-open');
    breaker.recordFailure();
    expect(breaker.currentState).toBe('open');
  });

  it('un éxito reinicia el conteo de fallos', () => {
    const breaker = new CircuitBreaker(2, 1_000, clock);
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    expect(breaker.currentState).toBe('closed');
  });
});

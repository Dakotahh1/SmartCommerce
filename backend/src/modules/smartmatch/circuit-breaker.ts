export type BreakerState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker mínimo: tras `failureThreshold` fallos consecutivos se abre durante `openMs`
 * y las solicitudes fallan de inmediato (degradación controlada sin esperar timeouts).
 * Luego permite una solicitud de prueba (half-open).
 */
export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly openMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get currentState(): BreakerState {
    if (this.state === 'open' && this.now() - this.openedAt >= this.openMs) {
      this.state = 'half-open';
    }
    return this.state;
  }

  canRequest(): boolean {
    return this.currentState !== 'open';
  }

  recordSuccess(): void {
    this.state = 'closed';
    this.failures = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    if (
      this.currentState === 'half-open' ||
      this.failures >= this.failureThreshold
    ) {
      this.state = 'open';
      this.openedAt = this.now();
    }
  }
}

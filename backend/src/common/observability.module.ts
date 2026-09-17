import { Global, Module } from '@nestjs/common';
import { MetricsRegistry } from './metrics.js';

@Global()
@Module({
  providers: [MetricsRegistry],
  exports: [MetricsRegistry],
})
export class ObservabilityModule {}

import { Global, Module } from '@nestjs/common';
import { SmartMatchClient } from './smartmatch.client.js';

@Global()
@Module({
  providers: [SmartMatchClient],
  exports: [SmartMatchClient],
})
export class SmartMatchModule {}

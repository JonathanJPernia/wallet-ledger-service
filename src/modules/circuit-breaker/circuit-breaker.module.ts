import { Module } from '@nestjs/common';
import { CircuitBreakerRepository } from './circuit-breaker.repository';
import { CircuitBreakerService } from './circuit-breaker.service';

@Module({
  providers: [CircuitBreakerRepository, CircuitBreakerService],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}

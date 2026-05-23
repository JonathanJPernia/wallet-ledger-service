import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { httpRequestDuration } from './metrics.registry';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => this.observe(request, response, start),
        error: () => this.observe(request, response, start),
      }),
    );
  }

  private observe(request: Request, response: Response, start: bigint): void {
    const route =
      (request.route?.path as string | undefined) ??
      request.path ??
      'unknown';
    const elapsedSec =
      Number(process.hrtime.bigint() - start) / 1_000_000_000;

    httpRequestDuration.observe(
      {
        method: request.method,
        route,
        status: String(response.statusCode),
      },
      elapsedSec,
    );
  }
}

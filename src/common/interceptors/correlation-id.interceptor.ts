import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';

export const CORRELATION_ID_HEADER = 'x-request-id';

/**
 * Propaga o genera un ID de correlación por request.
 * Base para idempotencia, trazabilidad y auditoría en operaciones financieras.
 */
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const incoming = request.headers[CORRELATION_ID_HEADER];
    const requestId =
      typeof incoming === 'string' && incoming.length > 0
        ? incoming
        : randomUUID();

    request.headers[CORRELATION_ID_HEADER] = requestId;
    response.setHeader(CORRELATION_ID_HEADER, requestId);

    return next.handle();
  }
}

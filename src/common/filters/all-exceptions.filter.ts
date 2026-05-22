import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { DomainException } from '../errors/domain.exception';

interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  errorCode?: string;
  path: string;
  timestamp: string;
  requestId?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : { message: 'Internal server error' };

    const message = this.extractMessage(exceptionResponse);
    const error = this.extractErrorName(exception, status);
    const errorCode =
      exception instanceof DomainException
        ? exception.errorCode
        : this.extractErrorCode(exceptionResponse);
    const requestId = request.headers['x-request-id'] as string | undefined;

    const body: ErrorResponseBody = {
      statusCode: status,
      message,
      error,
      path: request.url,
      timestamp: new Date().toISOString(),
      ...(errorCode && { errorCode }),
      ...(requestId && { requestId }),
    };

    if (status >= Number(HttpStatus.INTERNAL_SERVER_ERROR)) {
      this.logger.error(
        {
          requestId,
          path: request.url,
          method: request.method,
          statusCode: status,
          err: exception instanceof Error ? exception : undefined,
        },
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn({
        requestId,
        path: request.url,
        method: request.method,
        statusCode: status,
        message,
      });
    }

    response.status(status).json(body);
  }

  private extractMessage(
    exceptionResponse: string | object,
  ): string | string[] {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }
    if (
      typeof exceptionResponse === 'object' &&
      'message' in exceptionResponse
    ) {
      const msg = (exceptionResponse as { message: string | string[] }).message;
      return msg;
    }
    return 'Unexpected error';
  }

  private extractErrorName(exception: unknown, status: number): string {
    if (exception instanceof HttpException) {
      return exception.name;
    }
    return HttpStatus[status] ?? 'Error';
  }

  private extractErrorCode(
    exceptionResponse: string | object,
  ): string | undefined {
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'errorCode' in exceptionResponse
    ) {
      return (exceptionResponse as { errorCode: string }).errorCode;
    }
    return undefined;
  }
}

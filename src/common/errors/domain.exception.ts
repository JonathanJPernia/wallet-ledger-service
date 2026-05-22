import { HttpException, HttpStatus } from '@nestjs/common';
import type { ErrorCode } from './error-codes';

export interface DomainExceptionBody {
  statusCode: number;
  message: string;
  errorCode: ErrorCode;
  error: string;
}

export class DomainException extends HttpException {
  constructor(
    public readonly errorCode: ErrorCode,
    message: string,
    statusCode: HttpStatus,
  ) {
    const body: DomainExceptionBody = {
      statusCode,
      message,
      errorCode,
      error: errorCode,
    };
    super(body, statusCode);
  }
}

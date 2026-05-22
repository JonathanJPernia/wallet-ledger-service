import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { DomainException } from '../../../common/errors/domain.exception';

export class IdempotencyKeyRequiredException extends DomainException {
  constructor() {
    super(
      ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
      'Idempotency-Key header is required',
      HttpStatus.BAD_REQUEST,
    );
  }
}

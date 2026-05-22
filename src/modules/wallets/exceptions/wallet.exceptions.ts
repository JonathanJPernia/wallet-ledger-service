import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-codes';
import { DomainException } from '../../../common/errors/domain.exception';

export class UnsupportedCurrencyException extends DomainException {
  constructor(currency: string) {
    super(
      ErrorCode.UNSUPPORTED_CURRENCY,
      `Currency "${currency}" is not supported`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

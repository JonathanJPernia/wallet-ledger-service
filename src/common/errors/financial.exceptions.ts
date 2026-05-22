import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';
import { DomainException } from './domain.exception';

export class WalletNotFoundException extends DomainException {
  constructor(walletId: string) {
    super(
      ErrorCode.WALLET_NOT_FOUND,
      `Wallet ${walletId} not found`,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class WalletNotActiveException extends DomainException {
  constructor(walletId: string, status: string) {
    super(
      ErrorCode.WALLET_NOT_ACTIVE,
      `Wallet ${walletId} is not active (status: ${status})`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class CurrencyMismatchException extends DomainException {
  constructor(expected: string, received: string) {
    super(
      ErrorCode.CURRENCY_MISMATCH,
      `Currency mismatch: wallet expects ${expected}, received ${received}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class InvalidAmountException extends DomainException {
  constructor() {
    super(
      ErrorCode.INVALID_AMOUNT,
      'Amount must be greater than zero',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class InsufficientFundsException extends DomainException {
  constructor(walletId: string) {
    super(
      ErrorCode.INSUFFICIENT_FUNDS,
      `Insufficient funds in wallet ${walletId}`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class SameWalletTransferException extends DomainException {
  constructor(walletId: string) {
    super(
      ErrorCode.SAME_WALLET_TRANSFER,
      `Cannot transfer to the same wallet (${walletId})`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class ConcurrencyConflictException extends DomainException {
  constructor(walletId: string) {
    super(
      ErrorCode.CONCURRENCY_CONFLICT,
      `Concurrent modification detected for wallet ${walletId}`,
      HttpStatus.CONFLICT,
    );
  }
}

export class IdempotencyConflictException extends DomainException {
  constructor(key: string, detail?: string) {
    const suffix = detail ? ` (${detail})` : '';
    super(
      ErrorCode.IDEMPOTENCY_CONFLICT,
      `Request with idempotency key "${key}" is already being processed${suffix}`,
      HttpStatus.CONFLICT,
    );
  }
}

export class IdempotencyPayloadMismatchException extends DomainException {
  constructor(key: string) {
    super(
      ErrorCode.IDEMPOTENCY_PAYLOAD_MISMATCH,
      `Idempotency key "${key}" was already used with a different request payload`,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class SerializationFailureException extends DomainException {
  constructor() {
    super(
      ErrorCode.SERIALIZATION_FAILURE,
      'Transaction failed after maximum serialization retries',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}

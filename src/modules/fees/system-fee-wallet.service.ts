import {
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { WalletKind } from '@prisma/client';
import { FeesRepository } from './fees.repository';

export const SYSTEM_FEE_WALLET_DEFAULT_CURRENCY = 'USD';

/**
 * SYSTEM_FEE wallet por moneda (no una sola global).
 * Futuro: extender clave a tenantId + businessLine sin cambiar lock/intent flow.
 */
@Injectable()
export class SystemFeeWalletService implements OnModuleInit {
  private readonly logger = new Logger(SystemFeeWalletService.name);
  private readonly feeWalletIdByCurrency = new Map<string, string>();

  constructor(private readonly feesRepository: FeesRepository) {}

  async onModuleInit(): Promise<void> {
    await this.ensureSystemFeeWallet(SYSTEM_FEE_WALLET_DEFAULT_CURRENCY);
  }

  async ensureSystemFeeWallet(currency: string): Promise<string> {
    const normalized = currency.toUpperCase();
    const cached = this.feeWalletIdByCurrency.get(normalized);
    if (cached) {
      return cached;
    }

    let wallet =
      await this.feesRepository.findSystemFeeWalletByCurrency(normalized);
    if (!wallet) {
      wallet = await this.feesRepository.createSystemFeeWallet(normalized);
      this.logger.log({
        event: 'fees.system_wallet_created',
        walletId: wallet.id,
        currency: wallet.currency,
      });
    }

    this.feeWalletIdByCurrency.set(normalized, wallet.id);
    return wallet.id;
  }

  async getSystemFeeWalletId(currency: string): Promise<string> {
    return this.ensureSystemFeeWallet(currency);
  }

  isSystemFeeWallet(walletId: string): boolean {
    return [...this.feeWalletIdByCurrency.values()].includes(walletId);
  }

  isSystemFeeWalletKind(kind: WalletKind): boolean {
    return kind === WalletKind.SYSTEM_FEE;
  }
}

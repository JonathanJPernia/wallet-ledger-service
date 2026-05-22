import { Injectable } from '@nestjs/common';
import { Prisma, Wallet, WalletStatus } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';

export type CreateWalletRecordInput = {
  currency: string;
};

@Injectable()
export class WalletsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateWalletRecordInput): Promise<Wallet> {
    return this.prisma.wallet.create({
      data: {
        currency: input.currency,
        status: WalletStatus.ACTIVE,
        currentBalance: new Prisma.Decimal(0),
        version: 1,
      },
    });
  }

  async findById(id: string): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({
      where: { id },
    });
  }
}

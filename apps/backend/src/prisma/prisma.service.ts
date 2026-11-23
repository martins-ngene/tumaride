import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    if (!process.env.DATABASE_URL) {
      this.logger.warn(
        'DATABASE_URL not configured — skipping live Prisma connection.',
      );
      return;
    }
    try {
      await this.$connect();
      this.logger.log('Connected to PostgreSQL via Prisma ORM.');
    } catch (err) {
      this.logger.error(
        `Failed to connect to PostgreSQL: ${(err as Error).message}`,
      );
    }
  }

  async onModuleDestroy() {
    if (process.env.DATABASE_URL) {
      await this.$disconnect();
    }
  }
}

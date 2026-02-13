import type { AppConfig, Logger, AppDatabase } from '@paperless-dedupe/core';

declare global {
  namespace App {
    interface Locals {
      config: AppConfig;
      logger: Logger;
      db: AppDatabase;
    }
  }
}

export {};

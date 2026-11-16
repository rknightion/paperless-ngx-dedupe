import type { AppConfig, Logger, AppDatabase } from '@paperless-dedupe/core';
import { type IncomingMessage } from 'node:http';
import type Database from 'better-sqlite3';

declare global {
  namespace App {
    interface Platform {
      req?: IncomingMessage;
    }
    interface Locals {
      config: AppConfig;
      logger: Logger;
      db: AppDatabase;
      sqlite: Database.Database;
    }
  }
}

export {};

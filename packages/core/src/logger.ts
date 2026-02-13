import pino from 'pino';
import type { Logger } from 'pino';

let rootLogger: Logger;

export function initLogger(level: string): Logger {
  rootLogger = pino({
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
  });
  return rootLogger;
}

export function createLogger(name: string): Logger {
  if (!rootLogger) {
    rootLogger = pino({
      level: 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }
  return rootLogger.child({ module: name });
}

export function getLogger(): Logger {
  if (!rootLogger) {
    rootLogger = pino({
      level: 'info',
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }
  return rootLogger;
}

export type { Logger };

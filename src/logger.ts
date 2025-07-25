import chalk from "chalk";

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4,
}

class Logger {
  private level: LogLevel;

  constructor() {
    // Check environment variable or default to WARN
    const envLevel = process.env.ZEN_SYNC_LOG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case "ERROR":
        this.level = LogLevel.ERROR;
        break;
      case "WARN":
        this.level = LogLevel.WARN;
        break;
      case "INFO":
        this.level = LogLevel.INFO;
        break;
      case "DEBUG":
        this.level = LogLevel.DEBUG;
        break;
      case "VERBOSE":
        this.level = LogLevel.VERBOSE;
        break;
      default:
        this.level = LogLevel.WARN;
    }
  }

  setLevel(level: LogLevel) {
    this.level = level;
  }

  private log(level: LogLevel, levelName: string, color: any, message: string, ...args: any[]) {
    if (level <= this.level) {
      const timestamp = new Date().toISOString();
      console.log(color(`[${timestamp}] [${levelName}]`), message, ...args);
    }
  }

  error(message: string, ...args: any[]) {
    this.log(LogLevel.ERROR, "ERROR", chalk.red, message, ...args);
  }

  warn(message: string, ...args: any[]) {
    this.log(LogLevel.WARN, "WARN", chalk.yellow, message, ...args);
  }

  info(message: string, ...args: any[]) {
    this.log(LogLevel.INFO, "INFO", chalk.blue, message, ...args);
  }

  debug(message: string, ...args: any[]) {
    this.log(LogLevel.DEBUG, "DEBUG", chalk.gray, message, ...args);
  }

  verbose(message: string, ...args: any[]) {
    this.log(LogLevel.VERBOSE, "VERBOSE", chalk.magenta, message, ...args);
  }
}

export const logger = new Logger();

// Helper to enable verbose logging
export function enableVerboseLogging() {
  logger.setLevel(LogLevel.VERBOSE);
  logger.info("Verbose logging enabled");
} 
/**
 * Structured logger with configurable log levels
 * Reduces noise during testing while preserving debug capability
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export class Logger {
  private static instance: Logger
  private currentLevel: LogLevel = LogLevel.INFO
  private context: string = ''

  private constructor() {
    // Set log level based on environment  
    if (typeof window !== 'undefined' && window.location?.search?.includes('debug=true')) {
      this.currentLevel = LogLevel.DEBUG
    } else if (typeof globalThis !== 'undefined' && (globalThis as { vi?: unknown }).vi) {
      // Vitest sets the global 'vi' object during tests
      this.currentLevel = LogLevel.WARN // Only warnings and errors during tests
    } else {
      this.currentLevel = LogLevel.DEBUG // Default to debug for development
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  /**
   * Create a logger with a specific context prefix
   */
  static withContext(context: string): Logger {
    const logger = Logger.getInstance()
    const contextLogger = Object.create(logger)
    contextLogger.context = context
    return contextLogger
  }

  /**
   * Set the current log level
   */
  setLevel(level: LogLevel): void {
    this.currentLevel = level
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString().slice(11, 23) // HH:mm:ss.sss
    const prefix = this.context ? `[${this.context}]` : ''
    return `${timestamp} ${level} ${prefix} ${message}`
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.currentLevel
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.ERROR)) {
      console.error(this.formatMessage('ERROR', message), ...args)
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.WARN)) {
      console.warn(this.formatMessage('WARN', message), ...args)
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.INFO)) {
      console.log(this.formatMessage('INFO', message), ...args)
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG)) {
      console.debug(this.formatMessage('DEBUG', message), ...args)
    }
  }

}

// Export a default instance for convenience
export const logger = Logger.getInstance()

/**
 * Structured logger with configurable log levels
 * 
 * Features:
 * - Per-context log levels (set DEBUG for specific classes only)
 * - Log categories: lifecycle (startup flow) vs runtime (frame updates, LOD changes)
 * - Global and per-context level configuration
 * 
 * Usage:
 *   const log = Logger.withContext('MyClass')
 *   log.info('Starting up')           // Always shown at INFO level
 *   log.lifecycle('Init phase 1')     // Startup/teardown flow (DEBUG by default)
 *   log.runtime('LOD changed')        // Frame-by-frame events (suppressed by default)
 * 
 * Configuration:
 *   Logger.setContextLevel('LodDistanceManager', LogLevel.WARN)  // Quiet specific class
 *   Logger.setRuntimeLogging(true)                                // Enable runtime logs
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4  // For very verbose output
}

/** Log categories for filtering */
export enum LogCategory {
  /** Normal log messages */
  GENERAL = 'general',
  /** Startup, initialization, teardown flow */
  LIFECYCLE = 'lifecycle',
  /** Per-frame, high-frequency runtime events */
  RUNTIME = 'runtime'
}

export class Logger {
  private static instance: Logger
  private globalLevel: LogLevel = LogLevel.INFO
  private context: string = ''
  
  // Per-context level overrides (classes must opt-in to DEBUG)
  private static contextLevels: Map<string, LogLevel> = new Map()
  
  // Category toggles (runtime is off by default to reduce noise)
  private static categoryEnabled: Map<LogCategory, boolean> = new Map([
    [LogCategory.GENERAL, true],
    [LogCategory.LIFECYCLE, true],
    [LogCategory.RUNTIME, false]  // Off by default - too noisy
  ])

  private constructor() {
    // Global default is INFO - classes must opt-in for DEBUG via setContextLevel
    // Can be overridden via URL param for full debugging
    if (typeof window !== 'undefined' && window.location?.search?.includes('debug=true')) {
      this.globalLevel = LogLevel.DEBUG
    } else if (typeof globalThis !== 'undefined' && (globalThis as { vi?: unknown }).vi) {
      this.globalLevel = LogLevel.WARN // Only warnings and errors during tests
    } else {
      this.globalLevel = LogLevel.INFO // Default to INFO - opt-in for DEBUG
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
   * Set log level for a specific context (class name)
   * Useful for silencing noisy classes or enabling debug for specific ones
   */
  static setContextLevel(context: string, level: LogLevel): void {
    Logger.contextLevels.set(context, level)
  }

  /**
   * Clear context-specific level override
   */
  static clearContextLevel(context: string): void {
    Logger.contextLevels.delete(context)
  }

  /**
   * Get all context-specific level overrides (for debugging)
   */
  static getContextLevels(): Map<string, LogLevel> {
    return new Map(Logger.contextLevels)
  }

  /**
   * Clear all context-specific level overrides
   */
  static clearAllContextLevels(): void {
    Logger.contextLevels.clear()
  }

  /**
   * Reset Logger to default state (for testing)
   * Clears all context levels and resets categories to defaults
   */
  static reset(): void {
    Logger.contextLevels.clear()
    Logger.categoryEnabled.set(LogCategory.GENERAL, true)
    Logger.categoryEnabled.set(LogCategory.LIFECYCLE, true)
    Logger.categoryEnabled.set(LogCategory.RUNTIME, false)
    // Reset global level to INFO
    if (Logger.instance) {
      Logger.instance.globalLevel = LogLevel.INFO
    }
  }

  /**
   * Get the current global log level
   */
  getLevel(): LogLevel {
    return this.globalLevel
  }

  /**
   * Enable or disable a log category globally
   */
  static setCategoryEnabled(category: LogCategory, enabled: boolean): void {
    Logger.categoryEnabled.set(category, enabled)
  }

  /**
   * Get whether a category is enabled
   */
  static isCategoryEnabled(category: LogCategory): boolean {
    return Logger.categoryEnabled.get(category) ?? true
  }

  /**
   * Convenience: Enable runtime logging (high-frequency events)
   */
  static setRuntimeLogging(enabled: boolean): void {
    Logger.setCategoryEnabled(LogCategory.RUNTIME, enabled)
  }

  /**
   * Set the global log level (applies to contexts without overrides)
   */
  setLevel(level: LogLevel): void {
    this.globalLevel = level
  }

  /**
   * Get effective log level for this context
   */
  private getEffectiveLevel(): LogLevel {
    if (this.context && Logger.contextLevels.has(this.context)) {
      return Logger.contextLevels.get(this.context)!
    }
    return this.globalLevel
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString().slice(11, 23) // HH:mm:ss.sss
    const prefix = this.context ? `[${this.context}]` : ''
    return `${timestamp} ${level} ${prefix} ${message}`
  }

  private shouldLog(level: LogLevel, category: LogCategory = LogCategory.GENERAL): boolean {
    // Check category first
    if (!Logger.categoryEnabled.get(category)) {
      return false
    }
    // Then check level
    return level <= this.getEffectiveLevel()
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

  /**
   * Lifecycle logs - startup, initialization, teardown flow
   * Shown by default, but can be disabled
   */
  lifecycle(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG, LogCategory.LIFECYCLE)) {
      console.debug(this.formatMessage('LIFE', message), ...args)
    }
  }

  /**
   * Runtime logs - per-frame events, LOD changes, high-frequency updates
   * Disabled by default to reduce noise. Enable with Logger.setRuntimeLogging(true)
   */
  runtime(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.DEBUG, LogCategory.RUNTIME)) {
      console.debug(this.formatMessage('RT', message), ...args)
    }
  }

  /**
   * Trace logs - very verbose, for deep debugging
   */
  trace(message: string, ...args: unknown[]): void {
    if (this.shouldLog(LogLevel.TRACE)) {
      console.debug(this.formatMessage('TRACE', message), ...args)
    }
  }
}

// Export a default instance for convenience
export const logger = Logger.getInstance()

/**
 * Console helper functions for per-class log level control
 * Usage from browser console:
 *   setLogLevel('HighTextureCache', 'WARN')  // Quiet specific class
 *   setLogLevel('LodArtworkOrchestrator', 'DEBUG')  // Enable debug for specific class
 *   resetLogLevel('HighTextureCache')  // Reset to global level
 *   listLogLevels()  // Show all context-specific overrides
 *   setGlobalLogLevel('INFO')  // Set default level for all
 *   enableRuntimeLogs()  // Enable high-frequency logs
 *   disableRuntimeLogs()  // Disable high-frequency logs
 */
function setLogLevel(context: string, level: keyof typeof LogLevel): void {
  Logger.setContextLevel(context, LogLevel[level])
  console.log(`📝 Log level for "${context}" set to ${level}`)
}

function resetLogLevel(context: string): void {
  Logger.clearContextLevel(context)
  console.log(`📝 Log level for "${context}" reset to global`)
}

function listLogLevels(): void {
  const levels = Logger.getContextLevels()
  if (levels.size === 0) {
    console.log('📝 No context-specific log levels set')
    return
  }
  console.log('📝 Context-specific log levels:')
  for (const [context, level] of levels) {
    const levelName = Object.entries(LogLevel).find(([, v]) => v === level)?.[0] ?? 'UNKNOWN'
    console.log(`   ${context}: ${levelName}`)
  }
}

function setGlobalLogLevel(level: keyof typeof LogLevel): void {
  Logger.getInstance().setLevel(LogLevel[level])
  console.log(`📝 Global log level set to ${level}`)
}

function enableRuntimeLogs(): void {
  Logger.setRuntimeLogging(true)
  console.log('📝 Runtime logs enabled (high-frequency events)')
}

function disableRuntimeLogs(): void {
  Logger.setRuntimeLogging(false)
  console.log('📝 Runtime logs disabled')
}

// Expose Logger and helpers globally for console configuration
if (typeof window !== 'undefined') {
  (window as unknown as { Logger: typeof Logger }).Logger = Logger
  ;(window as unknown as { LogLevel: typeof LogLevel }).LogLevel = LogLevel
  ;(window as unknown as { LogCategory: typeof LogCategory }).LogCategory = LogCategory
  
  // Expose helper functions
  ;(window as unknown as { setLogLevel: typeof setLogLevel }).setLogLevel = setLogLevel
  ;(window as unknown as { resetLogLevel: typeof resetLogLevel }).resetLogLevel = resetLogLevel
  ;(window as unknown as { listLogLevels: typeof listLogLevels }).listLogLevels = listLogLevels
  ;(window as unknown as { setGlobalLogLevel: typeof setGlobalLogLevel }).setGlobalLogLevel = setGlobalLogLevel
  ;(window as unknown as { enableRuntimeLogs: typeof enableRuntimeLogs }).enableRuntimeLogs = enableRuntimeLogs
  ;(window as unknown as { disableRuntimeLogs: typeof disableRuntimeLogs }).disableRuntimeLogs = disableRuntimeLogs
}

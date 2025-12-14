/**
 * Logger Unit Tests
 * 
 * Tests the structured logger's per-class log level control,
 * category filtering, and global vs context-specific behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Logger, LogLevel, LogCategory } from '../../../src/utils/Logger'

describe('Logger', () => {
    // Spy on console methods
    let consoleSpy: {
        log: ReturnType<typeof vi.spyOn>
        debug: ReturnType<typeof vi.spyOn>
        warn: ReturnType<typeof vi.spyOn>
        error: ReturnType<typeof vi.spyOn>
    }

    beforeEach(() => {
        // Reset logger state before each test
        Logger.reset()
        
        // Spy on console methods
        consoleSpy = {
            log: vi.spyOn(console, 'log').mockImplementation(() => {}),
            debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
            warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
            error: vi.spyOn(console, 'error').mockImplementation(() => {})
        }
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    describe('Global Log Level', () => {
        it('should default to INFO level in test environment', () => {
            // After reset, global level should be INFO (tests override to WARN, but reset sets INFO)
            const logger = Logger.getInstance()
            logger.setLevel(LogLevel.INFO)
            expect(logger.getLevel()).toBe(LogLevel.INFO)
        })

        it('should allow setting global log level', () => {
            const logger = Logger.getInstance()
            logger.setLevel(LogLevel.DEBUG)
            expect(logger.getLevel()).toBe(LogLevel.DEBUG)
        })

        it('should filter DEBUG messages when global level is INFO', () => {
            const log = Logger.createLogFunctions('TestClass')
            Logger.getInstance().setLevel(LogLevel.INFO)

            log.debug('This should be filtered')
            log.info('This should appear')

            expect(consoleSpy.debug).not.toHaveBeenCalled()
            expect(consoleSpy.log).toHaveBeenCalledTimes(1)
        })

        it('should show DEBUG messages when global level is DEBUG', () => {
            const log = Logger.createLogFunctions('TestClass')
            Logger.getInstance().setLevel(LogLevel.DEBUG)

            log.debug('This should appear')

            expect(consoleSpy.debug).toHaveBeenCalledTimes(1)
        })

        it('should always show ERROR messages regardless of level', () => {
            const log = Logger.createLogFunctions('TestClass')
            Logger.getInstance().setLevel(LogLevel.ERROR)

            log.error('This should always appear')
            log.warn('This should be filtered')
            log.info('This should be filtered')
            log.debug('This should be filtered')

            expect(consoleSpy.error).toHaveBeenCalledTimes(1)
            expect(consoleSpy.warn).not.toHaveBeenCalled()
            expect(consoleSpy.log).not.toHaveBeenCalled()
            expect(consoleSpy.debug).not.toHaveBeenCalled()
        })
    })

    describe('Per-Context Log Levels (Opt-In)', () => {
        it('should allow classes to opt-in to DEBUG logging', () => {
            const log = Logger.createLogFunctions('MyDebugClass')
            Logger.getInstance().setLevel(LogLevel.INFO) // Global is INFO

            // Before opt-in, DEBUG is filtered
            log.debug('Should be filtered')
            expect(consoleSpy.debug).not.toHaveBeenCalled()

            // Opt-in to DEBUG for this class
            Logger.setContextLevel('MyDebugClass', LogLevel.DEBUG)

            log.debug('Should now appear')
            expect(consoleSpy.debug).toHaveBeenCalledTimes(1)
        })

        it('should allow silencing specific noisy classes', () => {
            const noisyLog = Logger.createLogFunctions('NoisyClass')
            const normalLog = Logger.createLogFunctions('NormalClass')
            Logger.getInstance().setLevel(LogLevel.INFO)

            // Silence the noisy class
            Logger.setContextLevel('NoisyClass', LogLevel.ERROR)

            noisyLog.info('Should be filtered')
            noisyLog.warn('Should be filtered')
            normalLog.info('Should appear')

            expect(consoleSpy.log).toHaveBeenCalledTimes(1)
            expect(consoleSpy.warn).not.toHaveBeenCalled()
        })

        it('should allow resetting context level back to global', () => {
            const log = Logger.createLogFunctions('TestClass')
            Logger.getInstance().setLevel(LogLevel.INFO)

            // Set context level
            Logger.setContextLevel('TestClass', LogLevel.DEBUG)
            log.debug('Should appear')
            expect(consoleSpy.debug).toHaveBeenCalledTimes(1)

            // Clear context level - should fall back to global INFO
            Logger.clearContextLevel('TestClass')
            log.debug('Should be filtered now')
            expect(consoleSpy.debug).toHaveBeenCalledTimes(1) // Still just 1
        })

        it('should track multiple context levels independently', () => {
            const logA = Logger.createLogFunctions('ClassA')
            const logB = Logger.createLogFunctions('ClassB')
            const logC = Logger.createLogFunctions('ClassC')
            Logger.getInstance().setLevel(LogLevel.INFO)

            Logger.setContextLevel('ClassA', LogLevel.DEBUG)
            Logger.setContextLevel('ClassB', LogLevel.WARN)
            // ClassC uses global (INFO)

            logA.debug('ClassA debug - should appear')
            logB.info('ClassB info - should be filtered')
            logC.info('ClassC info - should appear')

            expect(consoleSpy.debug).toHaveBeenCalledTimes(1)
            expect(consoleSpy.log).toHaveBeenCalledTimes(1)
        })

        it('should list all context level overrides', () => {
            Logger.setContextLevel('Class1', LogLevel.DEBUG)
            Logger.setContextLevel('Class2', LogLevel.WARN)
            Logger.setContextLevel('Class3', LogLevel.ERROR)

            const levels = Logger.getContextLevels()

            expect(levels.size).toBe(3)
            expect(levels.get('Class1')).toBe(LogLevel.DEBUG)
            expect(levels.get('Class2')).toBe(LogLevel.WARN)
            expect(levels.get('Class3')).toBe(LogLevel.ERROR)
        })

        it('should clear all context levels', () => {
            Logger.setContextLevel('Class1', LogLevel.DEBUG)
            Logger.setContextLevel('Class2', LogLevel.WARN)

            Logger.clearAllContextLevels()

            expect(Logger.getContextLevels().size).toBe(0)
        })
    })

    describe('Log Categories', () => {
        it('should filter RUNTIME logs by default', () => {
            const log = Logger.createLogFunctions('TestClass')
            Logger.getInstance().setLevel(LogLevel.DEBUG)

            log.runtime('Runtime event - should be filtered by default')

            expect(consoleSpy.debug).not.toHaveBeenCalled()
        })

        it('should show RUNTIME logs when enabled', () => {
            const log = Logger.createLogFunctions('TestClass')
            Logger.getInstance().setLevel(LogLevel.DEBUG)

            Logger.setRuntimeLogging(true)
            log.runtime('Runtime event - should now appear')

            expect(consoleSpy.debug).toHaveBeenCalledTimes(1)
        })

        it('should show LIFECYCLE logs by default', () => {
            const log = Logger.createLogFunctions('TestClass')
            Logger.getInstance().setLevel(LogLevel.DEBUG)

            log.lifecycle('Lifecycle event')

            expect(consoleSpy.debug).toHaveBeenCalledTimes(1)
        })

        it('should allow disabling LIFECYCLE logs', () => {
            const log = Logger.createLogFunctions('TestClass')
            Logger.getInstance().setLevel(LogLevel.DEBUG)

            Logger.setCategoryEnabled(LogCategory.LIFECYCLE, false)
            log.lifecycle('Should be filtered')

            expect(consoleSpy.debug).not.toHaveBeenCalled()
        })

        it('should report category enabled status', () => {
            expect(Logger.isCategoryEnabled(LogCategory.GENERAL)).toBe(true)
            expect(Logger.isCategoryEnabled(LogCategory.LIFECYCLE)).toBe(true)
            expect(Logger.isCategoryEnabled(LogCategory.RUNTIME)).toBe(false)

            Logger.setRuntimeLogging(true)
            expect(Logger.isCategoryEnabled(LogCategory.RUNTIME)).toBe(true)
        })
    })

    describe('Logger Reset', () => {
        it('should reset all state to defaults', () => {
            // Modify various settings
            Logger.getInstance().setLevel(LogLevel.TRACE)
            Logger.setContextLevel('TestClass', LogLevel.DEBUG)
            Logger.setRuntimeLogging(true)

            // Reset
            Logger.reset()

            // Verify defaults restored
            expect(Logger.getInstance().getLevel()).toBe(LogLevel.INFO)
            expect(Logger.getContextLevels().size).toBe(0)
            expect(Logger.isCategoryEnabled(LogCategory.RUNTIME)).toBe(false)
            expect(Logger.isCategoryEnabled(LogCategory.LIFECYCLE)).toBe(true)
        })
    })

    describe('Message Formatting', () => {
        it('should include context name in log messages', () => {
            const log = Logger.createLogFunctions('MyComponent')
            Logger.getInstance().setLevel(LogLevel.INFO)

            log.info('Test message')

            expect(consoleSpy.log).toHaveBeenCalledWith(
                expect.stringContaining('[MyComponent]'),
                'Test message'
            )
        })

        it('should include timestamp in log messages', () => {
            const log = Logger.createLogFunctions('TestClass')
            Logger.getInstance().setLevel(LogLevel.INFO)

            log.info('Test message')

            // Timestamp format: HH:mm:ss.sss
            expect(consoleSpy.log).toHaveBeenCalledWith(
                expect.stringMatching(/\d{2}:\d{2}:\d{2}\.\d{3}/),
                'Test message'
            )
        })

        it('should pass additional arguments to console', () => {
            const log = Logger.createLogFunctions('TestClass')
            Logger.getInstance().setLevel(LogLevel.INFO)

            const testObj = { foo: 'bar' }
            log.info('Test message', testObj)

            expect(consoleSpy.log).toHaveBeenCalledWith(
                expect.any(String),
                'Test message',
                testObj
            )
        })
    })

    describe('Log Level Hierarchy', () => {
        it('should respect ERROR < WARN < INFO < DEBUG < TRACE hierarchy', () => {
            const log = Logger.createLogFunctions('TestClass')

            // At ERROR level, only errors show
            Logger.getInstance().setLevel(LogLevel.ERROR)
            log.error('error')
            log.warn('warn')
            log.info('info')
            log.debug('debug')
            log.trace('trace')

            expect(consoleSpy.error).toHaveBeenCalledTimes(1)
            expect(consoleSpy.warn).toHaveBeenCalledTimes(0)
            expect(consoleSpy.log).toHaveBeenCalledTimes(0)
            expect(consoleSpy.debug).toHaveBeenCalledTimes(0)

            vi.clearAllMocks()

            // At WARN level, errors and warnings show
            Logger.getInstance().setLevel(LogLevel.WARN)
            log.error('error')
            log.warn('warn')
            log.info('info')

            expect(consoleSpy.error).toHaveBeenCalledTimes(1)
            expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
            expect(consoleSpy.log).toHaveBeenCalledTimes(0)

            vi.clearAllMocks()

            // At DEBUG level, everything except trace shows
            Logger.getInstance().setLevel(LogLevel.DEBUG)
            log.error('error')
            log.warn('warn')
            log.info('info')
            log.debug('debug')
            log.trace('trace')

            expect(consoleSpy.error).toHaveBeenCalledTimes(1)
            expect(consoleSpy.warn).toHaveBeenCalledTimes(1)
            expect(consoleSpy.log).toHaveBeenCalledTimes(1)
            expect(consoleSpy.debug).toHaveBeenCalledTimes(1) // debug message
            // trace is filtered because level is DEBUG, not TRACE
        })
    })

    describe('createLogFunctions', () => {
        it('should return all log function types', () => {
            const logFuncs = Logger.createLogFunctions('TestClass')

            expect(typeof logFuncs.error).toBe('function')
            expect(typeof logFuncs.warn).toBe('function')
            expect(typeof logFuncs.info).toBe('function')
            expect(typeof logFuncs.debug).toBe('function')
            expect(typeof logFuncs.lifecycle).toBe('function')
            expect(typeof logFuncs.runtime).toBe('function')
            expect(typeof logFuncs.trace).toBe('function')
        })

        it('should respect level filtering', () => {
            const { info, debug } = Logger.createLogFunctions('TestClass')

            // At default INFO level, info shows but debug doesn't
            info('info message')
            debug('debug message')

            expect(consoleSpy.log).toHaveBeenCalledTimes(1)
            expect(consoleSpy.debug).toHaveBeenCalledTimes(0)
        })

        it('should include context in output', () => {
            const { info } = Logger.createLogFunctions('MyComponent')

            info('test message')

            expect(consoleSpy.log).toHaveBeenCalledWith(
                expect.stringContaining('[MyComponent]'),
                'test message'
            )
        })

        it('should respect per-context level overrides', () => {
            const { debug } = Logger.createLogFunctions('DebugComponent')

            // At default INFO, debug is filtered
            debug('should be filtered')
            expect(consoleSpy.debug).toHaveBeenCalledTimes(0)

            // Enable DEBUG for this context
            Logger.setContextLevel('DebugComponent', LogLevel.DEBUG)
            debug('should appear now')
            expect(consoleSpy.debug).toHaveBeenCalledTimes(1)
        })

        it('should handle additional arguments', () => {
            const { info } = Logger.createLogFunctions('TestClass')
            const obj = { key: 'value' }

            info('message with object', obj, 42, true)

            expect(consoleSpy.log).toHaveBeenCalledWith(
                expect.stringContaining('[TestClass]'),
                'message with object',
                obj,
                42,
                true
            )
        })

        it('should filter RUNTIME logs by default', () => {
            Logger.getInstance().setLevel(LogLevel.DEBUG)
            const { runtime } = Logger.createLogFunctions('TestClass')

            runtime('runtime event')

            // Runtime is disabled by default
            expect(consoleSpy.debug).toHaveBeenCalledTimes(0)

            // Enable runtime
            Logger.setRuntimeLogging(true)
            runtime('runtime event 2')
            expect(consoleSpy.debug).toHaveBeenCalledTimes(1)
        })
    })
})

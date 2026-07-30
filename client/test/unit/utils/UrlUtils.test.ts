import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { UrlUtils } from '../../../src/utils/UrlUtils'

describe('UrlUtils', () => {
    const originalLocation = window.location

    function setSearch(search: string): void {
        Object.defineProperty(window, 'location', {
            value: { ...originalLocation, search },
            writable: true,
            configurable: true,
        })
    }

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            value: originalLocation,
            writable: true,
            configurable: true,
        })
    })

    describe('isDiagnosticsEnabled', () => {
        it('is true for ?diagnostics=1', () => {
            setSearch('?diagnostics=1')
            expect(UrlUtils.isDiagnosticsEnabled()).toBe(true)
        })

        it('is true for ?sweep=1 alone — a sweep implies diagnostics', () => {
            setSearch('?sweep=1')
            expect(UrlUtils.isDiagnosticsEnabled()).toBe(true)
        })

        it('is false with neither param present', () => {
            setSearch('')
            expect(UrlUtils.isDiagnosticsEnabled()).toBe(false)
        })

        it('is false for a near-miss value', () => {
            setSearch('?diagnostics=true')
            expect(UrlUtils.isDiagnosticsEnabled()).toBe(false)
        })
    })

    describe('isPerfSweepEnabled', () => {
        it('is true for ?sweep=1', () => {
            setSearch('?sweep=1')
            expect(UrlUtils.isPerfSweepEnabled()).toBe(true)
        })

        it('is false when only ?diagnostics=1 is present', () => {
            setSearch('?diagnostics=1')
            expect(UrlUtils.isPerfSweepEnabled()).toBe(false)
        })
    })

    describe('isDebugLoggingEnabled', () => {
        it('is true for ?debug=true', () => {
            setSearch('?debug=true')
            expect(UrlUtils.isDebugLoggingEnabled()).toBe(true)
        })

        it('is false without it', () => {
            setSearch('')
            expect(UrlUtils.isDebugLoggingEnabled()).toBe(false)
        })
    })

    describe('defensive fallback when window.location is unavailable', () => {
        it('does not throw and reads every flag as false when window has no location property', () => {
            // Regression case: some test environments mock `window` as a bare object with
            // no `location` key at all (not even `location: undefined`) — window.location.search
            // throws directly in that shape without this guard.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (window as any).location

            expect(() => UrlUtils.isDiagnosticsEnabled()).not.toThrow()
            expect(UrlUtils.isDiagnosticsEnabled()).toBe(false)
            expect(UrlUtils.isPerfSweepEnabled()).toBe(false)
            expect(UrlUtils.isDebugLoggingEnabled()).toBe(false)
        })
    })

    describe('stripQueryParam', () => {
        it('removes one param, leaving others intact', () => {
            expect(UrlUtils.stripQueryParam('https://example.com/?a=1&b=2', 'a')).toBe('https://example.com/?b=2')
        })

        it('drops the trailing ? when no params remain', () => {
            expect(UrlUtils.stripQueryParam('https://example.com/?a=1', 'a')).toBe('https://example.com/')
        })

        it('returns the input unchanged for an unparseable URL', () => {
            expect(UrlUtils.stripQueryParam('not a url', 'a')).toBe('not a url')
        })
    })
})

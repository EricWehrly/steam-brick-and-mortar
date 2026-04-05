/**
 * Network isolation for tests.
 *
 * Blocks all outbound fetch/XHR calls by default to prevent:
 * - Accidental real API/CDN hits in unit and integration tests
 * - 5-second timeout stalls from unreachable external services
 * - Flaky tests due to network availability in CI/CD
 *
 * To allow network calls in a specific test, override fetch in that test:
 *   vi.stubGlobal('fetch', vi.fn().mockResolvedValue(...))
 * or use the test-local mock pattern already established for image downloads.
 *
 * This only applies to the vitest unit/integration test runners.
 * Playwright visual tests run in a real browser and are unaffected.
 */

import { vi, beforeEach, afterEach } from 'vitest'

const BLOCKED_FETCH_ERROR =
    'Network call blocked in test environment. ' +
    'Mock fetch for this test or use test/utils/mock-worker helpers. ' +
    'See test-network-isolation.md for guidance.'

export function installNetworkIsolation(): void {
    // Block fetch globally — tests that need network must mock it explicitly
    vi.stubGlobal('fetch', (_url: RequestInfo | URL) => {
        return Promise.reject(new Error(`${BLOCKED_FETCH_ERROR} (URL: ${String(_url)})`))
    })
}

export function resetNetworkIsolation(): void {
    // Reset to blocked state between tests (prevents leaking per-test stubs)
    vi.stubGlobal('fetch', (_url: RequestInfo | URL) => {
        return Promise.reject(new Error(`${BLOCKED_FETCH_ERROR} (URL: ${String(_url)})`))
    })
}

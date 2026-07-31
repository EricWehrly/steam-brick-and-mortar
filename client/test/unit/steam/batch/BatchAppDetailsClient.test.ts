import { describe, it, expect, beforeEach } from 'vitest'
import { setupFetchMock } from '../../../utils/test-helpers'
import { BatchAppDetailsClient, type BatchAppDetailsResult } from '../../../../src/steam/batch/BatchAppDetailsClient'
import { EventManager } from '../../../../src/core/EventManager'

const NO_ARTWORK = { header: null, capsule: null, capsule_v5: null, background: null, background_raw: null }

function jsonResponse(body: BatchAppDetailsResult | undefined, ok = true, status = 200) {
    return {
        ok,
        status,
        statusText: ok ? 'OK' : 'Service Unavailable',
        json: async () => body,
    }
}

function makeBatchResult(appids: number[]): BatchAppDetailsResult {
    return {
        success: true,
        total_requested: appids.length,
        total_successful: appids.length,
        total_failed: 0,
        results: appids.map(appid => ({
            success: true,
            appid,
            retrieved_at: '2026-01-01T00:00:00Z',
            data: { name: `Game ${appid}`, type: 'game', is_free: false, artwork: NO_ARTWORK },
        })),
        timestamp: '2026-01-01T00:00:00Z',
    }
}

describe('BatchAppDetailsClient', () => {
    let fetchMock: ReturnType<typeof setupFetchMock>
    let client: BatchAppDetailsClient

    beforeEach(() => {
        fetchMock = setupFetchMock()
        // A fresh instance per test - the circuit breaker is shared per-instance by design (see
        // its own doc comment), so "does an open circuit persist across calls" needs one instance
        // reused across multiple fetchBatch() calls, while every other test needs a clean breaker.
        client = new BatchAppDetailsClient('https://steam-api-dev.example.com', EventManager.getInstance())
    })

    it('fetches every batch and merges results when all succeed', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(makeBatchResult([1, 2])))
            .mockResolvedValueOnce(jsonResponse(makeBatchResult([3, 4])))

        const result = await client.fetchBatch([1, 2, 3, 4], { batchSize: 2 })

        expect(fetchMock).toHaveBeenCalledTimes(2)
        expect(result.size).toBe(4)
        expect(result.get(3)?.data?.name).toBe('Game 3')
    })

    it('opens the circuit on the first hard failure and skips remaining batches without further requests', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(undefined, false, 503))
            // Would succeed if called - proves the breaker, not luck, is what stops the loop.
            .mockResolvedValueOnce(jsonResponse(makeBatchResult([3, 4])))
            .mockResolvedValueOnce(jsonResponse(makeBatchResult([5, 6])))

        const result = await client.fetchBatch([1, 2, 3, 4, 5, 6], { batchSize: 2 })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(result.size).toBe(0)
    })

    it('keeps failing fast on a later call while the circuit is still open, without hitting the network again', async () => {
        fetchMock.mockResolvedValueOnce(jsonResponse(undefined, false, 503))

        const first = await client.fetchBatch([1, 2], { batchSize: 2 })
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(first.size).toBe(0)

        fetchMock.mockClear()
        const second = await client.fetchBatch([9, 10], { batchSize: 2 })

        expect(fetchMock).not.toHaveBeenCalled()
        expect(second.size).toBe(0)
    })

    it('still fetches successfully when the circuit is closed and every batch succeeds, even with several batches', async () => {
        fetchMock
            .mockResolvedValueOnce(jsonResponse(makeBatchResult([1])))
            .mockResolvedValueOnce(jsonResponse(makeBatchResult([2])))
            .mockResolvedValueOnce(jsonResponse(makeBatchResult([3])))

        const result = await client.fetchBatch([1, 2, 3], { batchSize: 1 })

        expect(fetchMock).toHaveBeenCalledTimes(3)
        expect(result.size).toBe(3)
    })
})

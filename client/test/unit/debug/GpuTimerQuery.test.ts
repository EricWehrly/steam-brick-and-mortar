import { describe, it, expect, vi } from 'vitest'
import { GpuTimerQuery } from '../../../src/debug/GpuTimerQuery'

interface MockQuery {
    id: number
}

function createMockGl(extensionAvailable = true) {
    let nextQueryId = 0
    const resultAvailable = new Map<number, boolean>()
    const results = new Map<number, number>()
    let disjoint = false

    const ext = {
        TIME_ELAPSED_EXT: 'TIME_ELAPSED_EXT',
        GPU_DISJOINT_EXT: 'GPU_DISJOINT_EXT',
    }

    const gl = {
        QUERY_RESULT_AVAILABLE: 'QUERY_RESULT_AVAILABLE',
        QUERY_RESULT: 'QUERY_RESULT',
        getExtension: vi.fn().mockReturnValue(extensionAvailable ? ext : null),
        createQuery: vi.fn().mockImplementation((): MockQuery => {
            const query = { id: nextQueryId++ }
            resultAvailable.set(query.id, false)
            return query
        }),
        beginQuery: vi.fn(),
        endQuery: vi.fn(),
        deleteQuery: vi.fn(),
        getQueryParameter: vi.fn().mockImplementation((query: MockQuery, pname: string) => {
            if (pname === 'QUERY_RESULT_AVAILABLE') {
                return resultAvailable.get(query.id) ?? false
            }
            if (pname === 'QUERY_RESULT') {
                return results.get(query.id) ?? 0
            }
            return null
        }),
        getParameter: vi.fn().mockImplementation((pname: string) => {
            if (pname === 'GPU_DISJOINT_EXT') {
                return disjoint
            }
            return null
        }),
        // Test helpers, not part of the real WebGL2 API
        __resolveQuery: (query: MockQuery, elapsedNs: number) => {
            resultAvailable.set(query.id, true)
            results.set(query.id, elapsedNs)
        },
        __setDisjoint: (value: boolean) => { disjoint = value },
    }

    return gl
}

describe('GpuTimerQuery', () => {
    it('isSupported is false when the extension is unavailable', () => {
        const gl = createMockGl(false)
        const timer = new GpuTimerQuery(gl as unknown as WebGL2RenderingContext)

        expect(timer.isSupported).toBe(false)
    })

    it('still runs the work function when the extension is unavailable', () => {
        const gl = createMockGl(false)
        const timer = new GpuTimerQuery(gl as unknown as WebGL2RenderingContext)
        const work = vi.fn()
        const onResult = vi.fn()

        timer.measure(work, onResult)

        expect(work).toHaveBeenCalledOnce()
        expect(onResult).not.toHaveBeenCalled()
        expect(gl.beginQuery).not.toHaveBeenCalled()
    })

    it('wraps work in beginQuery/endQuery when supported', () => {
        const gl = createMockGl(true)
        const timer = new GpuTimerQuery(gl as unknown as WebGL2RenderingContext)
        const callOrder: string[] = []
        const work = vi.fn(() => callOrder.push('work'))
        gl.beginQuery.mockImplementation(() => callOrder.push('begin'))
        gl.endQuery.mockImplementation(() => callOrder.push('end'))

        timer.measure(work, vi.fn())

        expect(callOrder).toEqual(['begin', 'work', 'end'])
    })

    it('resolves onResult with elapsed ms once the query result is available', () => {
        const gl = createMockGl(true)
        const timer = new GpuTimerQuery(gl as unknown as WebGL2RenderingContext)
        const onResult = vi.fn()

        let issuedQuery: MockQuery | null = null
        gl.createQuery.mockImplementation(() => {
            issuedQuery = { id: 0 }
            return issuedQuery
        })

        timer.measure(() => {}, onResult)
        timer.poll() // not ready yet
        expect(onResult).not.toHaveBeenCalled()

        gl.__resolveQuery(issuedQuery!, 5_000_000) // 5ms in nanoseconds
        timer.poll()

        expect(onResult).toHaveBeenCalledWith(5)
        expect(gl.deleteQuery).toHaveBeenCalledWith(issuedQuery)
    })

    it('drops the result silently when the driver reports a disjoint event', () => {
        const gl = createMockGl(true)
        const timer = new GpuTimerQuery(gl as unknown as WebGL2RenderingContext)
        const onResult = vi.fn()

        let issuedQuery: MockQuery | null = null
        gl.createQuery.mockImplementation(() => {
            issuedQuery = { id: 0 }
            return issuedQuery
        })

        timer.measure(() => {}, onResult)
        gl.__resolveQuery(issuedQuery!, 5_000_000)
        gl.__setDisjoint(true)
        timer.poll()

        expect(onResult).not.toHaveBeenCalled()
        expect(gl.deleteQuery).toHaveBeenCalledWith(issuedQuery)
    })

    it('resolves multiple queries in submission order, stopping at the first not-ready one', () => {
        const gl = createMockGl(true)
        const timer = new GpuTimerQuery(gl as unknown as WebGL2RenderingContext)
        const issued: MockQuery[] = []
        gl.createQuery.mockImplementation(() => {
            const q = { id: issued.length }
            issued.push(q)
            return q
        })

        const results: number[] = []
        timer.measure(() => {}, (ms) => results.push(ms))
        timer.measure(() => {}, (ms) => results.push(ms))
        timer.measure(() => {}, (ms) => results.push(ms))

        // Only the second query resolves — poll must not skip ahead to it before the first.
        gl.__resolveQuery(issued[1], 2_000_000)
        timer.poll()
        expect(results).toEqual([])

        gl.__resolveQuery(issued[0], 1_000_000)
        timer.poll()
        expect(results).toEqual([1, 2])
    })

    it('dispose() discards pending queries without invoking their callbacks', () => {
        const gl = createMockGl(true)
        const timer = new GpuTimerQuery(gl as unknown as WebGL2RenderingContext)
        const onResult = vi.fn()

        timer.measure(() => {}, onResult)
        timer.dispose()

        expect(gl.deleteQuery).toHaveBeenCalledOnce()
        expect(onResult).not.toHaveBeenCalled()
    })
})

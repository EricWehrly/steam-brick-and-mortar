import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NeonGeometryWorker } from '../../../../src/scene/signs/NeonGeometryWorker'
import type { NeonGeometryResponse, NeonGeometryError } from '../../../../src/utils/workers/neon-geometry.worker'

// ─── Fake Worker ──────────────────────────────────────────────────────────────

class FakeWorker implements EventTarget {
    onmessage: ((e: MessageEvent) => void) | null = null
    onerror:   ((e: ErrorEvent)   => void) | null = null
    onmessageerror: null = null
    postMessage  = vi.fn()
    terminate    = vi.fn()
    addEventListener    = vi.fn()
    removeEventListener = vi.fn()
    dispatchEvent = vi.fn(() => true)

    respond(data: object) { this.onmessage?.({ data } as MessageEvent) }
    crash(errorDetail?: Error) {
        this.onerror?.({ message: undefined, error: errorDetail ?? new Error('crash') } as ErrorEvent)
    }
}

// ─── Mock the Vite ?worker import ────────────────────────────────────────────

let fakeWorker: FakeWorker

vi.mock('../../../../src/utils/workers/neon-geometry.worker?worker', () => ({
    default: function () { return fakeWorker },
}))

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('NeonGeometryWorker', () => {
    beforeEach(() => {
        fakeWorker = new FakeWorker()
        vi.clearAllMocks()
    })

    it('posts a neon-geometry message to the worker', async () => {
        const w = new NeonGeometryWorker()
        const pending = w.buildTubes('test', { fontSize: 0.3, tubeRadius: 0.015, segments: 12 })
        expect(fakeWorker.postMessage).toHaveBeenCalledOnce()
        const msg = fakeWorker.postMessage.mock.calls[0][0]
        expect(msg.kind).toBe('neon-geometry')
        expect(msg.text).toBe('test')
        expect(msg.fontSize).toBe(0.3)
        expect(msg.tubeRadius).toBe(0.015)
        expect(msg.segments).toBe(12)
        expect(typeof msg.messageId).toBe('string')
        w.dispose()
        await expect(pending).rejects.toThrow('disposed')
    })

    it('resolves with tube arrays when worker responds with kind=neon-geometry', async () => {
        const w = new NeonGeometryWorker()
        const promise = w.buildTubes('hi', { fontSize: 0.3, tubeRadius: 0.015, segments: 12 })

        const { messageId } = fakeWorker.postMessage.mock.calls[0][0] as { messageId: string }
        const tube = new Float32Array([0, 0, 0, 1, 0, 0])
        fakeWorker.respond({
            kind: 'neon-geometry',
            messageId,
            tubes: [tube],
            offsetX: -0.5,
            offsetY: -0.1,
        } satisfies NeonGeometryResponse)

        const result = await promise
        expect(result.tubes).toHaveLength(1)
        expect(result.offsetX).toBe(-0.5)
        expect(result.offsetY).toBe(-0.1)
        w.dispose()
    })

    it('rejects when worker responds with kind=neon-geometry-error', async () => {
        const w = new NeonGeometryWorker()
        const promise = w.buildTubes('fail', { fontSize: 0.3, tubeRadius: 0.015, segments: 12 })

        const { messageId } = fakeWorker.postMessage.mock.calls[0][0] as { messageId: string }
        fakeWorker.respond({
            kind: 'neon-geometry-error',
            messageId,
            error: 'font fetch failed',
        } satisfies NeonGeometryError)

        await expect(promise).rejects.toThrow('font fetch failed')
        w.dispose()
    })

    it('rejects all pending when worker crashes', async () => {
        const w = new NeonGeometryWorker()
        const promise = w.buildTubes('x', { fontSize: 0.3, tubeRadius: 0.015, segments: 12 })
        fakeWorker.crash(new Error('boom'))
        await expect(promise).rejects.toThrow('boom')
    })

    it('rejects immediately when disposed', async () => {
        const w = new NeonGeometryWorker()
        w.dispose()
        await expect(w.buildTubes('x', { fontSize: 0.3, tubeRadius: 0.015, segments: 12 })).rejects.toThrow('disposed')
    })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ManagedWorker, type WorkerMessage } from '../../../src/utils/ManagedWorker'

// Fake Worker that wires itself up so tests can trigger responses/crashes
class FakeWorker implements EventTarget {
    onmessage: ((e: MessageEvent) => void) | null = null
    onerror: ((e: ErrorEvent) => void) | null = null
    onmessageerror: null = null
    postMessage = vi.fn()
    terminate = vi.fn()
    addEventListener = vi.fn()
    removeEventListener = vi.fn()
    dispatchEvent = vi.fn(() => true)

    respond(data: object) { this.onmessage?.({ data } as MessageEvent) }
    crash(errorDetail?: Error) {
        this.onerror?.({ message: undefined, error: errorDetail ?? new Error('crash') } as ErrorEvent)
    }
}

interface TestIn extends WorkerMessage { type: 'PING' }
interface TestOut extends WorkerMessage { type: 'PONG'; value: number }

let fakeWorker: FakeWorker

class TestManagedWorker extends ManagedWorker<TestIn, TestOut> {
    public receivedMessages: TestOut[] = []

    constructor() {
        // Pass the fake worker instance through a factory that returns it
        super(() => fakeWorker as unknown as Worker, 'TestWorker')
    }

    protected override handleMessage(data: TestOut): void {
        this.receivedMessages.push(data)
    }

    public ping(messageId: string): Promise<TestOut> {
        return this.send<TestOut>({ type: 'PING', messageId })
    }
}

describe('ManagedWorker', () => {
    beforeEach(() => { fakeWorker = new FakeWorker() })

    it('sends a message to the worker', () => {
        const w = new TestManagedWorker()
        w.ping('id-1')
        expect(fakeWorker.postMessage).toHaveBeenCalledWith({ type: 'PING', messageId: 'id-1' })
    })

    it('resolves promise when worker responds with matching messageId', async () => {
        const w = new TestManagedWorker()
        const p = w.ping('id-2')
        fakeWorker.respond({ type: 'PONG', messageId: 'id-2', value: 42 })
        expect((await p).value).toBe(42)
    })

    it('rejects all pending promises on worker crash', async () => {
        const w = new TestManagedWorker()
        const p = w.ping('id-3')
        fakeWorker.crash(new Error('boom'))
        await expect(p).rejects.toThrow('boom')
    })

    it('crash rejection includes the worker name', async () => {
        const w = new TestManagedWorker()
        const p = w.ping('id-4')
        fakeWorker.crash(new Error('internal'))
        await expect(p).rejects.toThrow('TestWorker')
    })

    it('calls handleMessage for every received response', async () => {
        const w = new TestManagedWorker()
        const p = w.ping('id-5')
        fakeWorker.respond({ type: 'PONG', messageId: 'id-5', value: 1 })
        await p
        expect(w.receivedMessages).toHaveLength(1)
    })

    it('terminates the worker and rejects pending on dispose', async () => {
        const w = new TestManagedWorker()
        const p = w.ping('id-6')
        w.dispose()
        await expect(p).rejects.toThrow('disposed')
        expect(fakeWorker.terminate).toHaveBeenCalled()
        expect(w.pendingCount).toBe(0)
    })

    it('rejects immediately when already disposed', async () => {
        const w = new TestManagedWorker()
        w.dispose()
        await expect(w.ping('id-7')).rejects.toThrow('disposed')
    })
})
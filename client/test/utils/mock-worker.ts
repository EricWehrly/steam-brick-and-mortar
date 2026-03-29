type MockWorkerRequest = {
  type?: string
  messageId?: string
  textureIndex?: number
  textureSize?: number
  textureWidth?: number
  textureHeight?: number
  gameName?: string
}

type MockWorkerResponse = Record<string, unknown> | null

type MockWorkerMessageHandler = (request: MockWorkerRequest, worker: MockWorker) => MockWorkerResponse

const messageHandlers = new Map<string, MockWorkerMessageHandler>()

const buildDefaultTextureResponse = (request: MockWorkerRequest): Record<string, unknown> => {
  const messageId = request.messageId ?? `mock-${Date.now()}`
  const textureIndex = request.textureIndex ?? 0
  const width = request.textureWidth ?? request.textureSize ?? 300
  const height = request.textureHeight ?? request.textureSize ?? 450
  const imageData = new Uint8ClampedArray(width * height * 4)

  return {
    type: 'TEXTURE_PROCESSED',
    imageData,
    textureIndex,
    messageId,
    processingTime: 0,
    width,
    height,
    gameName: request.gameName,
    blob: new Blob([new Uint8Array([0])], { type: 'image/jpeg' })
  }
}

const defaultWorkerResponse = (request: MockWorkerRequest): MockWorkerResponse => {
  switch (request.type) {
    case 'PROCESS_TEXTURE':
    case 'FETCH_AND_PROCESS':
      return buildDefaultTextureResponse(request)
    default:
      return null
  }
}

export class MockWorker extends EventTarget {
  public onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null
  public onerror: ((this: AbstractWorker, ev: ErrorEvent) => unknown) | null = null
  public onmessageerror: ((this: Worker, ev: MessageEvent) => unknown) | null = null

  public readonly postedMessages: unknown[] = []

  constructor(..._args: unknown[]) {
    super()
  }

  postMessage(message: unknown): void {
    this.postedMessages.push(message)

    const request = (message ?? {}) as MockWorkerRequest
    const customHandler = request.type ? messageHandlers.get(request.type) : undefined
    const response = customHandler ? customHandler(request, this) : defaultWorkerResponse(request)

    if (!response) {
      return
    }

    Promise.resolve().then(() => {
      const event = new MessageEvent('message', { data: response })
      this.onmessage?.call(this as unknown as Worker, event)
      this.dispatchEvent(event)
    })
  }

  terminate(): void {
    // no-op for tests
  }
}

export const setMockWorkerMessageHandler = (messageType: string, handler: MockWorkerMessageHandler): void => {
  messageHandlers.set(messageType, handler)
}

export const resetMockWorkerMessageHandlers = (): void => {
  messageHandlers.clear()
}

export const installMockWorker = (): void => {
  if (typeof globalThis.Worker === 'undefined') {
    Object.defineProperty(globalThis, 'Worker', {
      value: MockWorker,
      writable: true,
      configurable: true
    })
    return
  }

  globalThis.Worker = MockWorker as unknown as typeof Worker
}

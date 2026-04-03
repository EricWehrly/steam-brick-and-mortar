/**
 * Shared test type utilities
 *
 * Vitest 4 changed the Mock type to include constructor signatures
 * (Mock<Procedure | Constructable>), which makes plain vi.fn() mocks
 * incompatible with strict function types like (event: CustomEvent<T>) => void.
 *
 * Use MockFn<Args, Return> instead of ReturnType<typeof vi.fn> when passing
 * mocks to APIs that expect specific function signatures.
 */
import type { Mock } from 'vitest'

/** A typed mock function compatible with strict function parameter types. */
export type MockFn<TArgs extends unknown[] = unknown[], TReturn = unknown> =
    Mock<(...args: TArgs) => TReturn>

/** Convenience cast: use when you need to pass vi.fn() where a typed function is expected. */
export function asMock<T extends (...args: unknown[]) => unknown>(fn: ReturnType<typeof import('vitest').vi.fn>): T {
    return fn as unknown as T
}

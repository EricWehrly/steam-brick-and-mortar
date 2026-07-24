export function indexAt(base: number, offset: number, length: number): number {
    if (length <= 0) return 0
    return ((base + offset) % length + length) % length
}

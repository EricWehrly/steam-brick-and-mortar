/** Last branch of a switch over a union: a compile error if a member is unhandled, and a thrown
 *  error at runtime if one slips through anyway. */
export function assertNever(value: never): never {
    throw new Error(`Unhandled case: ${JSON.stringify(value)}`)
}

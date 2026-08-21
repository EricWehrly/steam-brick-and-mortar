import { describe, it, expect, vi, afterEach } from 'vitest'
import { warnIfFieldUncovered } from '../../../src/utils/DataCoverageCheck'

describe('warnIfFieldUncovered', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('warns when zero items have the field populated', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        warnIfFieldUncovered([{ userscore: undefined }, { userscore: undefined }], 'userscore', item => item.userscore !== undefined)

        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(warnSpy.mock.calls[0].join(' ')).toContain('userscore')
    })

    it('does not warn when at least one item has the field populated', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        warnIfFieldUncovered([{ userscore: undefined }, { userscore: 80 }], 'userscore', item => item.userscore !== undefined)

        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('does not warn on an empty batch - nothing to judge coverage against yet', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        warnIfFieldUncovered([], 'userscore', () => false)

        expect(warnSpy).not.toHaveBeenCalled()
    })
})

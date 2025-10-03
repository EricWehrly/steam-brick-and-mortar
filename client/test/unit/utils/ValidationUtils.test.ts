import { describe, it, expect } from 'vitest'
import { ValidationUtils } from '../../../src/utils/ValidationUtils'

describe('ValidationUtils', () => {
    describe('parseSteamUserInput', () => {
        describe('steamID detection', () => {
            it('should detect direct steamID input', () => {
                expect(ValidationUtils.parseSteamUserInput('76561198054514251'))
                    .toEqual({ type: 'steamid', value: '76561198054514251' })
                expect(ValidationUtils.parseSteamUserInput('12345678901234567'))
                    .toEqual({ type: 'steamid', value: '12345678901234567' })
            })

            it('should extract steamID from profile URLs', () => {
                expect(ValidationUtils.parseSteamUserInput('https://steamcommunity.com/profiles/76561198054514251'))
                    .toEqual({ type: 'steamid', value: '76561198054514251' })
                expect(ValidationUtils.parseSteamUserInput('steamcommunity.com/profiles/76561198054514251'))
                    .toEqual({ type: 'steamid', value: '76561198054514251' })
                expect(ValidationUtils.parseSteamUserInput('/profiles/76561198054514251'))
                    .toEqual({ type: 'steamid', value: '76561198054514251' })
            })

            it('should handle profile URLs with trailing slashes', () => {
                expect(ValidationUtils.parseSteamUserInput('https://steamcommunity.com/profiles/76561198054514251/'))
                    .toEqual({ type: 'steamid', value: '76561198054514251' })
                expect(ValidationUtils.parseSteamUserInput('/profiles/76561198054514251/'))
                    .toEqual({ type: 'steamid', value: '76561198054514251' })
            })
        })

        describe('custom URL detection', () => {
            it('should handle direct custom URLs', () => {
                expect(ValidationUtils.parseSteamUserInput('SpiteMonger'))
                    .toEqual({ type: 'customurl', value: 'SpiteMonger' })
                expect(ValidationUtils.parseSteamUserInput('testuser123'))
                    .toEqual({ type: 'customurl', value: 'testuser123' })
            })

            it('should handle Steam custom URLs', () => {
                expect(ValidationUtils.parseSteamUserInput('https://steamcommunity.com/id/SpiteMonger'))
                    .toEqual({ type: 'customurl', value: 'SpiteMonger' })
                expect(ValidationUtils.parseSteamUserInput('steamcommunity.com/id/SpiteMonger'))
                    .toEqual({ type: 'customurl', value: 'SpiteMonger' })
                expect(ValidationUtils.parseSteamUserInput('/id/SpiteMonger'))
                    .toEqual({ type: 'customurl', value: 'SpiteMonger' })
            })
        })

        describe('edge cases', () => {
            it('should handle invalid input gracefully', () => {
                expect(ValidationUtils.parseSteamUserInput(null as any))
                    .toEqual({ type: 'customurl', value: '' })
                expect(ValidationUtils.parseSteamUserInput(''))
                    .toEqual({ type: 'customurl', value: '' })
            })
        })
    })

    describe('extractVanityFromInput (deprecated)', () => {
        it('should maintain backward compatibility', () => {
            expect(ValidationUtils.extractVanityFromInput('SpiteMonger')).toBe('SpiteMonger')
            expect(ValidationUtils.extractVanityFromInput('https://steamcommunity.com/id/SpiteMonger')).toBe('SpiteMonger')
            expect(ValidationUtils.extractVanityFromInput('76561198054514251')).toBe('76561198054514251')
        })
    })

    describe('isNonEmptyString', () => {
        it('should validate non-empty strings', () => {
            expect(ValidationUtils.isNonEmptyString('hello')).toBe(true)
            expect(ValidationUtils.isNonEmptyString('')).toBe(false)
            expect(ValidationUtils.isNonEmptyString('   ')).toBe(false)
        })
    })

    describe('sanitizeForDisplay', () => {
        it('should sanitize HTML and trim', () => {
            expect(ValidationUtils.sanitizeForDisplay('hello<script>alert("xss")</script>world'))
                .toBe('helloscriptalert("xss")/scriptworld')
            expect(ValidationUtils.sanitizeForDisplay('  hello world  '))
                .toBe('hello world')
        })
    })

    describe('stringToHue', () => {
        it('should return consistent hue values', () => {
            const hue1 = ValidationUtils.stringToHue('teststring')
            const hue2 = ValidationUtils.stringToHue('teststring')
            expect(hue1).toBe(hue2)
            expect(hue1).toBeGreaterThanOrEqual(0)
            expect(hue1).toBeLessThanOrEqual(1)
        })
    })
})
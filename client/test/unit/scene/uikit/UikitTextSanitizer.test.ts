/**
 * UikitTextSanitizer - HTML entity decoding (Steam's short_description otherwise shows a literal
 * "&amp;" instead of "&") alongside the existing glyph-stripping/whitespace behavior.
 */
import { describe, it, expect } from 'vitest'
import { toUikitSafeText, toUikitSafeMultilineText } from '../../../../src/scene/uikit/UikitTextSanitizer'

describe('toUikitSafeText', () => {
    it('decodes HTML entities Steam text fields commonly carry', () => {
        expect(toUikitSafeText('discovering &amp; breeding frogs')).toBe('discovering & breeding frogs')
        expect(toUikitSafeText('Cat &amp; Mouse: Deluxe &amp; Complete Edition')).toBe('Cat & Mouse: Deluxe & Complete Edition')
        expect(toUikitSafeText('Bill&#39;s Adventure')).toBe("Bill's Adventure")
    })

    it('strips glyphs uikit\'s msdf font cannot render', () => {
        expect(toUikitSafeText('Display — Advanced')).toBe('Display Advanced')
        expect(toUikitSafeText('🎮 Controls')).toBe('Controls')
    })

    it('collapses whitespace and trims', () => {
        expect(toUikitSafeText('  a   b  ')).toBe('a b')
    })
})

describe('toUikitSafeMultilineText', () => {
    it('does NOT decode HTML entities - the raw cache-entry JSON should show verbatim what is actually stored', () => {
        expect(toUikitSafeMultilineText('{"description": "cats &amp; dogs"}')).toBe('{"description": "cats &amp; dogs"}')
    })

    it('preserves newlines while stripping other non-printable characters', () => {
        expect(toUikitSafeMultilineText('line one\nline 🎮 two')).toBe('line one\nline  two')
    })
})

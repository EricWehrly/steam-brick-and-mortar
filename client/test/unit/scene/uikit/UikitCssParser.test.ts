import { describe, it, expect } from 'vitest'
import { parseUikitCss } from '../../../../src/scene/uikit/UikitCssParser'

describe('parseUikitCss', () => {
    it('camelCases kebab-case properties and passes keyword values through', () => {
        const styles = parseUikitCss('.box { flex-direction: column; justify-content: space-between; overflow: scroll }')

        expect(styles.box).toEqual({ flexDirection: 'column', justifyContent: 'space-between', overflow: 'scroll' })
    })

    it('turns px and bare numbers into numbers, and keeps percentages as strings', () => {
        const styles = parseUikitCss('.box { gap: 12px; render-order: 1000; width: 100%; opacity: 0.5; margin-top: -4px }')

        expect(styles.box).toEqual({ gap: 12, renderOrder: 1000, width: '100%', opacity: 0.5, marginTop: -4 })
    })

    it('turns true and false into booleans', () => {
        expect(parseUikitCss('.box { depth-test: false; visible: true }').box).toEqual({ depthTest: false, visible: true })
    })

    it('expands border-radius into the four corner properties uikit has', () => {
        expect(parseUikitCss('.box { border-radius: 12px }').box).toEqual({
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            borderBottomLeftRadius: 12,
            borderBottomRightRadius: 12
        })
    })

    it('resolves :root custom properties, regardless of where in the file they are declared', () => {
        const styles = parseUikitCss(`
            .box { gap: var(--space); }
            :root { --space: 8px; }
        `)

        expect(styles.box).toEqual({ gap: 8 })
    })

    it('resolves custom properties that reference other custom properties', () => {
        const styles = parseUikitCss(':root { --base: 6px; --double: var(--base) } .box { gap: var(--double) }')

        expect(styles.box).toEqual({ gap: 6 })
    })

    it('falls back to the external resolver for names the file does not declare', () => {
        const styles = parseUikitCss('.box { color: var(--color-text-primary) }', name => (name === '--color-text-primary' ? '#ffffff' : undefined))

        expect(styles.box).toEqual({ color: '#ffffff' })
    })

    it('prefers a variable the file declares over the external resolver', () => {
        const styles = parseUikitCss(':root { --x: 1px } .box { gap: var(--x) }', () => '99px')

        expect(styles.box).toEqual({ gap: 1 })
    })

    it('applies a grouped rule to every selector in it', () => {
        const styles = parseUikitCss('.a, .b { gap: 4px }')

        expect(styles.a).toEqual({ gap: 4 })
        expect(styles.b).toEqual({ gap: 4 })
    })

    it('merges separate rules for the same class, later declarations winning', () => {
        const styles = parseUikitCss(`
            .a, .b { gap: 4px; width: 10px }
            .a { gap: 8px; height: 20px }
        `)

        expect(styles.a).toEqual({ gap: 8, width: 10, height: 20 })
        expect(styles.b).toEqual({ gap: 4, width: 10 })
    })

    it('ignores comments, including ones spanning several lines', () => {
        const styles = parseUikitCss(`
            /* a header
               comment */
            .box { gap: 4px; /* trailing */ width: 8px }
        `)

        expect(styles.box).toEqual({ gap: 4, width: 8 })
    })

    it('does not emit :root as a class', () => {
        expect(Object.keys(parseUikitCss(':root { --x: 1px } .box { gap: var(--x) }'))).toEqual(['box'])
    })

    describe('rejects what it does not understand, rather than silently dropping it', () => {
        it.each([
            ['an id selector', '#box { gap: 4px }', /Unsupported selector/],
            ['a descendant selector', '.a .b { gap: 4px }', /Unsupported selector/],
            ['a pseudo-class', '.a:hover { gap: 4px }', /Unsupported selector/],
            ['an element selector', 'div { gap: 4px }', /Unsupported selector/],
            ['a block at-rule', '@font-face { gap: 4px }', /at-rule/],
            ['a nested at-rule', '@media (min-width: 1px) { .a { gap: 4px } }', /Unsupported CSS/],
            ['a nested block', '.a { .b { gap: 4px } }', /nested|Unsupported/],
            ['an unterminated block', '.a { gap: 4px', /unterminated|Unsupported/],
            ['an unknown var()', '.a { gap: var(--nope) }', /Unknown custom property --nope/],
            ['a var() cycle', ':root { --a: var(--b); --b: var(--a) } .x { gap: var(--a) }', /nesting too deep/],
            ['a custom property outside :root', '.a { --x: 1px }', /only allowed inside :root/],
            ['a non-custom property in :root', ':root { gap: 4px }', /only declare custom properties/],
            ['a declaration with no colon', '.a { gap }', /Malformed declaration/]
        ])('%s', (_label, css, message) => {
            expect(() => parseUikitCss(css)).toThrow(message)
        })
    })
})

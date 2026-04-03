import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

function readText(relativeFromThisFile: string): string {
    return readFileSync(new URL(relativeFromThisFile, import.meta.url), 'utf8')
}

// Add any new flyout panel here to have its layout contract verified automatically.
const FLYOUT_PANELS = [
    {
        name: 'Lighting controls',
        cssRelPath: '../../src/styles/lighting-controls-panel.css',
        rootClass: 'lighting-controls-panel',
        contentClass: 'lighting-controls-panel .panel-content',
    },
]

describe('Overlay slot layout contract', () => {
    it('reserves only compact right rail space for center lanes', () => {
        const mainCss = readText('../../src/styles/main.css')

        expect(mainCss).toContain('--ui-right-reserved')
        expect(mainCss).toContain('right: calc(var(--ui-edge-gap) + var(--ui-right-reserved) + var(--ui-stack-gap));')
        expect(mainCss).not.toContain('right: calc(var(--ui-edge-gap) + var(--ui-right-rail) + var(--ui-stack-gap));')
    })

    it('does not force top-right slot to reserve full menu width/height', () => {
        const mainCss = readText('../../src/styles/main.css')
        const topRightBlock = mainCss.match(/#ui-slot-top-right\s*\{[\s\S]*?\}/)?.[0] ?? ''

        expect(topRightBlock).toContain('min-width: var(--ui-right-reserved);')
        expect(topRightBlock).toContain('max-width: min(var(--ui-right-rail), calc(100vw - 2 * var(--ui-edge-gap)));')
        expect(topRightBlock).not.toContain('width: var(--ui-right-rail);')
        // slot must not have a fixed pixel bottom that locks its height
        expect(topRightBlock).not.toMatch(/bottom:\s*\d+px/)
    })
})

describe('Flyout panel layout contract', () => {
    it.each(FLYOUT_PANELS)(
        '$name panel auto-grows rather than stretching full height',
        ({ cssRelPath, rootClass, contentClass }) => {
            const css = readText(cssRelPath)
            const rootPattern = new RegExp(`\\.${rootClass.replace(/\s+/g, '\\s+')}\\s*\\{[\\s\\S]*?\\}`)
            const contentPattern = new RegExp(`\\.${contentClass.replace(/[\s.]/g, (c) => c === ' ' ? '\\s+' : '\\.')}\\s*\\{[\\s\\S]*?\\}`)
            const rootBlock = css.match(rootPattern)?.[0] ?? ''
            const contentBlock = css.match(contentPattern)?.[0] ?? ''

            // Panel sizes itself to content, not the container
            expect(rootBlock).toContain('flex: 0 0 auto;')
            expect(rootBlock).not.toContain('flex: 1 1 auto;')

            // Panel is capped by the viewport, not by a static percentage fill
            expect(rootBlock).toMatch(/max-height:.*d?vh/)
            expect(rootBlock).not.toContain('max-height: 100%;')

            // Scrollable content area is also capped, not unbounded
            expect(contentBlock).toMatch(/max-height:/)
            expect(contentBlock).not.toContain('max-height: none;')
        },
    )
})

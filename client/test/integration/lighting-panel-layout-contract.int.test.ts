import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

function readText(relativeFromThisFile: string): string {
    return readFileSync(new URL(relativeFromThisFile, import.meta.url), 'utf8')
}

describe('Lighting panel layout contract', () => {
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
        expect(topRightBlock).not.toContain('bottom:')
    })

    it('keeps lighting panel auto-growing instead of forcing full-height stretch', () => {
        const panelCss = readText('../../src/styles/lighting-controls-panel.css')
        const panelBlock = panelCss.match(/\.lighting-controls-panel\s*\{[\s\S]*?\}/)?.[0] ?? ''
        const contentBlock = panelCss.match(/\.lighting-controls-panel \.panel-content\s*\{[\s\S]*?\}/)?.[0] ?? ''

        expect(panelBlock).toContain('max-height: calc(100dvh - var(--ui-top-inset) - var(--ui-edge-gap));')
        expect(panelBlock).toContain('flex: 0 0 auto;')
        expect(panelBlock).not.toContain('max-height: 100%;')
        expect(panelBlock).not.toContain('flex: 1 1 auto;')

        expect(contentBlock).toContain('max-height: min(65vh, calc(100dvh - var(--ui-top-inset) - var(--ui-edge-gap) - 72px));')
        expect(contentBlock).not.toContain('max-height: none;')
    })
})

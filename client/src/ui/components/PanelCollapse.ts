/**
 * Toggles a `.ui-panel`'s collapsed state and flips its indicator glyph. Shared by every
 * collapsible panel (lighting controls, layout controls, steam-ui) so the interaction and the
 * glyph convention (▼ expanded, ▶ collapsed) can't drift between them the way three hand-rolled
 * copies did. Callers that need side effects on expand/collapse (e.g. re-scanning state) act on
 * the returned collapsed flag rather than duplicating the toggle itself.
 */
export function togglePanelCollapse(panel: HTMLElement, indicator: HTMLElement | null, collapsedClass: string): boolean {
    const collapsed = panel.classList.toggle(collapsedClass)
    if (indicator) {
        indicator.textContent = collapsed ? '▶' : '▼'
    }
    return collapsed
}

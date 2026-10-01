/**
 * Loads the VR menu's stylesheet (src/styles/vr-menu.css - edit appearance there, not here) into
 * uikit's own StyleSheet registry, and names its classes.
 *
 * Components take class names as their second constructor argument
 * (`new Container(props, [MENU_CLASS.panelRoot])`) and uikit resolves them out of the registry, like
 * a class attribute. MENU_CLASS exists so a typo is a compile error rather than a runtime warning;
 * a test keeps it in lockstep with the CSS file. Importing it is also what guarantees the
 * registration below has run before any component that names a class is constructed.
 *
 * Imported as raw text (`?raw`) on purpose: importing the .css directly would inject it into the
 * page's DOM styles, where it means nothing.
 */

import { StyleSheet } from '@pmndrs/uikit'
import vrMenuCss from '../../styles/vr-menu.css?raw'
import { resolveColorTokenVar } from '../../ui/ColorTokens'
import { parseUikitCss } from './UikitCssParser'

export const MENU_CLASS = {
    menuRoot: 'vr-menu-root',
    menuTabRow: 'vr-menu-tab-row',
    menuTabButton: 'vr-menu-tab-button',
    menuTabButtonActive: 'vr-menu-tab-button-active',
    menuTabLabel: 'vr-menu-tab-label',
    menuTabLabelActive: 'vr-menu-tab-label-active',
    menuContentArea: 'vr-menu-content-area',

    panelRoot: 'vr-menu-panel-root',
    panelTitle: 'vr-menu-panel-title',
    panelNote: 'vr-menu-panel-note',

    section: 'vr-menu-section',
    sectionHeading: 'vr-menu-section-heading',
    sectionDescription: 'vr-menu-section-description',

    settingRow: 'vr-menu-setting-row',
    settingRowHeader: 'vr-menu-setting-row-header',
    settingLabel: 'vr-menu-setting-label',
    settingValue: 'vr-menu-setting-value',
    toggleRow: 'vr-menu-toggle-row',
    toggleText: 'vr-menu-toggle-text',
    action: 'vr-menu-action',

    dialog: 'vr-menu-dialog',
    dialogTitle: 'vr-menu-dialog-title',
    dialogMessage: 'vr-menu-dialog-message',
    dialogFooter: 'vr-menu-dialog-footer',
    dialogButtonLabel: 'vr-menu-dialog-button-label',

    standalonePanelRoot: 'vr-standalone-panel-root',

    categoryPanel: 'vr-category-panel',
    categoryScroll: 'vr-category-scroll',
    categorySection: 'vr-category-section',
    categoryHeading: 'vr-category-heading',
    categoryRow: 'vr-category-row',
    categoryLabel: 'vr-category-label',
    categoryStatusLive: 'vr-category-status-live',
    categoryStatusPlanned: 'vr-category-status-planned',
    categoryStatusIdea: 'vr-category-status-idea'
} as const

// Vitest blanks .css files to '' unless a config's test.css.include matches them (see
// test/vitest.shared.ts). An empty stylesheet parses fine and just leaves the menu unstyled, so fail
// here instead of letting that pass silently.
if (vrMenuCss.trim().length === 0) {
    throw new Error('vr-menu.css loaded empty - is the test config missing RAW_STYLESHEET_CSS (test/vitest.shared.ts)?')
}

export const VR_MENU_STYLES = parseUikitCss(vrMenuCss, resolveColorTokenVar)

Object.assign(StyleSheet, VR_MENU_STYLES)

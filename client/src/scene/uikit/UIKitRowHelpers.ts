/**
 * Thin analog to UIComponent.ts's RangeControl - builds a @pmndrs/uikit component *tree*
 * (label + live value + Slider) instead of an HTML string, so uikit panels can lean on the same
 * row shape the DOM pause-menu panels already use.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Slider } from '@pmndrs/uikit-default'
import { signal } from '@preact/signals-core'
import { UIKIT_COLORS } from './UikitColorTokens'

// Bumped from 14/4 - direct request (2026-08-20): rows read as "unnecessarily squished, too
// tight, not readable enough."
const ROW_LABEL_FONT_SIZE = 16
const ROW_GAP = 8
// uikit's Text has no default color (renders black) - this panel's rows sit on a dark
// surface, so an unset color is invisible, not just low-contrast. Sourced from tokens.css'
// --color-text-primary via UIKIT_COLORS, not an ad-hoc hex value - see UikitColorTokens.ts.
const ROW_TEXT_COLOR = UIKIT_COLORS.textPrimary

export interface UIKitSliderRowOptions {
    readonly label: string
    readonly min: number
    readonly max: number
    readonly step: number
    readonly value: number
    readonly formatDisplay?: (value: number) => string
    readonly onChange: (value: number) => void
}

export interface UIKitSliderRow {
    readonly container: Container
    /** Resyncs the slider thumb and value label to an externally-set value (e.g. a reset-to-defaults
     *  action) - mirrors DisplayAdvancedPanel's DOM re-render, without rebuilding the row tree. */
    setValue(value: number): void
}

export function createSliderRow(options: UIKitSliderRowOptions): UIKitSliderRow {
    const { label, min, max, step, value, onChange } = options
    const formatDisplay = options.formatDisplay ?? ((v: number) => String(v))

    const row = new Container({ flexDirection: 'column', gap: ROW_GAP, width: '100%' })

    const labelRow = new Container({ flexDirection: 'row', justifyContent: 'space-between', width: '100%' })
    labelRow.add(new Text({ text: label, fontSize: ROW_LABEL_FONT_SIZE, color: ROW_TEXT_COLOR }))
    const valueText = new Text({ text: formatDisplay(value), fontSize: ROW_LABEL_FONT_SIZE, color: ROW_TEXT_COLOR })
    labelRow.add(valueText)
    row.add(labelRow)

    // A plain number here would put Slider in "controlled" mode where onValueChange still fires
    // correctly but the displayed thumb reads this same never-changing prop, so it visually
    // freezes mid-drag (confirmed against uikit-default's Slider source: currentSignal prefers
    // properties.value.value over its own drag-updated uncontrolledSignal). A signal keeps it
    // controlled (so external setValue()/reset stays a trivial assignment) while actually
    // reflecting drags, since onValueChange below writes back into it.
    const valueSignal = signal(value)
    const slider = new Slider({
        value: valueSignal,
        min,
        max,
        step,
        width: '100%',
        onValueChange: (next: number) => {
            valueSignal.value = next
            valueText.setProperties({ text: formatDisplay(next) })
            onChange(next)
        }
    })
    row.add(slider)

    return {
        container: row,
        setValue: (next: number) => {
            valueSignal.value = next
            valueText.setProperties({ text: formatDisplay(next) })
        }
    }
}

/**
 * Thin analog to UIComponent.ts's RangeControl - builds a @pmndrs/uikit component *tree*
 * (label + live value + Slider) instead of an HTML string, so uikit panels can lean on the same
 * row shape the DOM pause-menu panels already use.
 *
 * Carries no sizes or colors of its own: every node names a style out of VRMenuStyleSheet.ts.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Slider } from '@pmndrs/uikit-default'
import { signal } from '@preact/signals-core'
import { MENU_CLASS } from './VRMenuStyleSheet'
import { toUikitSafeText } from './UikitTextSanitizer'

export interface UIKitSliderRowOptions {
    readonly label: string
    readonly description?: string
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
    const { label, description, min, max, step, value, onChange } = options
    const formatDisplay = options.formatDisplay ?? ((v: number) => String(v))

    const row = new Container(undefined, [MENU_CLASS.settingRow])

    const header = new Container(undefined, [MENU_CLASS.settingRowHeader])
    header.add(new Text({ text: toUikitSafeText(label) }, [MENU_CLASS.settingLabel]))
    const valueText = new Text({ text: formatDisplay(value) }, [MENU_CLASS.settingValue])
    header.add(valueText)
    row.add(header)

    if (description) {
        row.add(new Text({ text: toUikitSafeText(description) }, [MENU_CLASS.sectionDescription]))
    }

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

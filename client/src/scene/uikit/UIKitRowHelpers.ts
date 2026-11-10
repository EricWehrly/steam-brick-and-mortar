/**
 * Thin analog to UIComponent.ts's RangeControl - builds a @pmndrs/uikit component *tree*
 * (label + live value + Slider) instead of an HTML string, so uikit panels can lean on the same
 * row shape the DOM pause-menu panels already use.
 *
 * Carries no sizes or colors of its own: every node names a class out of styles/vr-menu.css.
 */

import { Container, Text } from '@pmndrs/uikit'
import { Button, Slider, Switch, ToggleGroup, ToggleGroupItem } from '@pmndrs/uikit-default'
import { computed, signal, type ReadonlySignal } from '@preact/signals-core'
import { MENU_CLASS } from './VRMenuStyleSheet'
import { toUikitSafeText } from './UikitTextSanitizer'

export interface UIKitToggleRowOptions {
    readonly label: string
    readonly description?: string
    readonly checked: boolean
    readonly onChange: (checked: boolean) => void
}

export interface UIKitToggleRow {
    readonly container: Container
    /** Resyncs the switch to an externally-set value (e.g. a reset-to-defaults action). */
    setValue(checked: boolean): void
}

export function createToggleRow(options: UIKitToggleRowOptions): UIKitToggleRow {
    const { label, description, checked, onChange } = options

    const row = new Container(undefined, [MENU_CLASS.toggleRow])

    const text = new Container(undefined, [MENU_CLASS.toggleText])
    text.add(new Text({ text: toUikitSafeText(label) }, [MENU_CLASS.settingLabel]))
    if (description) {
        text.add(new Text({ text: toUikitSafeText(description) }, [MENU_CLASS.sectionDescription]))
    }
    row.add(text)

    // A signal, not a plain boolean, for the same reason as the slider below: a plain value puts
    // the switch in controlled mode with a prop that never changes, so it would visibly snap back.
    const checkedSignal = signal(checked)
    const toggleSwitch = new Switch({
        checked: checkedSignal,
        onCheckedChange: (next: boolean) => {
            checkedSignal.value = next
            onChange(next)
        }
    })
    toggleSwitch.handle.classList.add(MENU_CLASS.switchThumb)
    row.add(toggleSwitch)

    return {
        container: row,
        setValue: (next: boolean) => {
            checkedSignal.value = next
        }
    }
}

export interface UIKitActionButtonOptions {
    readonly label: string
    readonly onPress: () => void
    /** While true the button is not displayed (and takes no layout space). */
    readonly hidden?: ReadonlySignal<boolean>
}

/** A button that does something other than set a setting. It holds no state to resync. */
export function createActionButton(options: UIKitActionButtonOptions): Button {
    const { label, onPress, hidden } = options

    const button = new Button(
        {
            variant: 'secondary',
            onClick: onPress,
            ...(hidden && { display: computed<'none' | 'flex'>(() => (hidden.value ? 'none' : 'flex')) })
        },
        [MENU_CLASS.action]
    )
    button.add(new Text({ text: toUikitSafeText(label) }, [MENU_CLASS.settingLabel]))
    return button
}

export interface UIKitSelectRowOptions {
    readonly label: string
    readonly description?: string
    readonly options: readonly { readonly value: string; readonly label: string }[]
    readonly value: string
    readonly onChange: (value: string) => void
}

export interface UIKitSelectRow {
    readonly container: Container
    /** Resyncs the highlighted option to an externally-set value (e.g. a reset-to-defaults action). */
    setValue(value: string): void
}

/** A choice among a few named values, as a row of buttons with the current one highlighted - a
 *  dropdown would need a popup layer that a headset pointer has no good way to drive. */
export function createSelectRow(options: UIKitSelectRowOptions): UIKitSelectRow {
    const { label, description, value, onChange } = options

    const row = new Container(undefined, [MENU_CLASS.settingRow])
    row.add(new Text({ text: toUikitSafeText(label) }, [MENU_CLASS.settingLabel]))
    if (description) {
        row.add(new Text({ text: toUikitSafeText(description) }, [MENU_CLASS.sectionDescription]))
    }

    const selectedSignal = signal(value)
    const choices = new ToggleGroup({ variant: 'outline' }, [MENU_CLASS.optionRow])
    for (const option of options.options) {
        // Controlled by our own signal: clicking the selected item again reports "unchecked", which
        // is ignored rather than leaving the group with nothing chosen.
        const item = new ToggleGroupItem(
            {
                checked: computed(() => selectedSignal.value === option.value),
                onCheckedChange: (next: boolean) => {
                    if (!next || selectedSignal.peek() === option.value) {
                        return
                    }
                    selectedSignal.value = option.value
                    onChange(option.value)
                }
            },
            [MENU_CLASS.option]
        )
        item.add(new Text({ text: toUikitSafeText(option.label) }, [MENU_CLASS.settingLabel]))
        choices.add(item)
    }
    row.add(choices)

    return {
        container: row,
        setValue: (next: string) => {
            selectedSignal.value = next
        }
    }
}

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

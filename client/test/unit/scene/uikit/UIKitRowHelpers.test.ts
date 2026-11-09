import { describe, it, expect, vi } from 'vitest'
import { Group } from 'three'
import type { Container } from '@pmndrs/uikit'
import { Switch, type ToggleGroupItem } from '@pmndrs/uikit-default'
import { createSelectRow, createToggleRow } from '../../../../src/scene/uikit/UIKitRowHelpers'
import { MENU_CLASS } from '../../../../src/scene/uikit/VRMenuStyleSheet'

// uikit only resolves a node's properties once it is attached to a parent.
function buildToggle(checked: boolean) {
    const onChange = vi.fn()
    const row = createToggleRow({ label: 'Auto-save', checked, onChange })
    new Group().add(row.container)
    const toggleSwitch = row.container.children.find((child): child is Switch => child instanceof Switch)!
    const click = () => (toggleSwitch.properties.peek().onClick as () => void)()
    return { row, toggleSwitch, click, onChange }
}

describe('createToggleRow switch', () => {
    it.each([true, false])('starts in the state it was given (%s)', (checked) => {
        const { toggleSwitch } = buildToggle(checked)
        expect(toggleSwitch.currentSignal.value).toBe(checked)
    })

    it('flips and reports the new value when clicked', () => {
        const { toggleSwitch, click, onChange } = buildToggle(true)

        click()
        expect(toggleSwitch.currentSignal.value).toBe(false)
        expect(onChange).toHaveBeenLastCalledWith(false)

        click()
        expect(toggleSwitch.currentSignal.value).toBe(true)
        expect(onChange).toHaveBeenLastCalledWith(true)
    })

    it('follows setValue without reporting a change', () => {
        const { row, toggleSwitch, onChange } = buildToggle(true)

        row.setValue(false)

        expect(toggleSwitch.currentSignal.value).toBe(false)
        expect(onChange).not.toHaveBeenCalled()
    })

    it('styles the thumb', () => {
        const { toggleSwitch } = buildToggle(true)
        expect(toggleSwitch.handle.classList.contains(MENU_CLASS.switchThumb)).toBe(true)
    })
})

const SELECT_OPTIONS = [
    { value: 'low', label: 'Low' },
    { value: 'high', label: 'High' },
    { value: 'ultra', label: 'Ultra' }
]

function buildSelect(value: string) {
    const onChange = vi.fn()
    const row = createSelectRow({ label: 'Quality', options: SELECT_OPTIONS, value, onChange })
    new Group().add(row.container)
    const choices = row.container.children[row.container.children.length - 1] as Container
    expect(choices.classList.contains(MENU_CLASS.optionRow)).toBe(true)
    const buttons = choices.children as ToggleGroupItem[]
    const click = (index: number) => (buttons[index].properties.peek().onClick as () => void)()
    const selectedIndexes = () => buttons
        .map((button, index) => (button.currentSignal.value ? index : -1))
        .filter(index => index >= 0)
    return { row, buttons, click, selectedIndexes, onChange }
}

describe('createSelectRow', () => {
    it('builds one button per option', () => {
        expect(buildSelect('low').buttons).toHaveLength(SELECT_OPTIONS.length)
    })

    it('marks only the option it was given as selected', () => {
        expect(buildSelect('high').selectedIndexes()).toEqual([1])
    })

    it('selects and reports the clicked option', () => {
        const { click, selectedIndexes, onChange } = buildSelect('low')

        click(2)

        expect(selectedIndexes()).toEqual([2])
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledWith('ultra')
    })

    it('does not report a click on the option that is already selected', () => {
        const { click, onChange } = buildSelect('high')

        click(1)

        expect(onChange).not.toHaveBeenCalled()
    })

    it('follows setValue without reporting a change', () => {
        const { row, selectedIndexes, onChange } = buildSelect('low')

        row.setValue('ultra')

        expect(selectedIndexes()).toEqual([2])
        expect(onChange).not.toHaveBeenCalled()
    })

    it('leaves nothing selected when the value matches no option', () => {
        expect(buildSelect('bogus').selectedIndexes()).toEqual([])
    })

    it('keeps exactly one option selected however many times the selection moves', () => {
        const { click, row, selectedIndexes } = buildSelect('low')

        click(1)
        click(2)
        click(0)
        row.setValue('high')
        click(2)

        expect(selectedIndexes()).toEqual([2])
    })
})

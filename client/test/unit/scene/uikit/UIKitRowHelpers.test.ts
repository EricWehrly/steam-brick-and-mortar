import { describe, it, expect, vi } from 'vitest'
import { Group } from 'three'
import { Switch } from '@pmndrs/uikit-default'
import { createToggleRow } from '../../../../src/scene/uikit/UIKitRowHelpers'
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

    it('shows exactly the on or off track class for the current state', () => {
        const { row, toggleSwitch, click } = buildToggle(false)
        const trackClasses = () => [MENU_CLASS.switchOn, MENU_CLASS.switchOff]
            .filter(name => toggleSwitch.classList.contains(name))

        expect(trackClasses()).toEqual([MENU_CLASS.switchOff])
        click()
        expect(trackClasses()).toEqual([MENU_CLASS.switchOn])
        row.setValue(false)
        expect(trackClasses()).toEqual([MENU_CLASS.switchOff])
    })

    it('styles the thumb', () => {
        const { toggleSwitch } = buildToggle(true)
        expect(toggleSwitch.handle.classList.contains(MENU_CLASS.switchThumb)).toBe(true)
    })
})

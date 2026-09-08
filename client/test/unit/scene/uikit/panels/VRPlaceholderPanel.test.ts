import { describe, it, expect } from 'vitest'
import { Container } from '@pmndrs/uikit'
import { VRPlaceholderPanel } from '../../../../../src/scene/uikit/panels/VRPlaceholderPanel'

describe('VRPlaceholderPanel', () => {
    it('constructs a real uikit component tree without throwing', () => {
        expect(() => new VRPlaceholderPanel({ title: 'More Settings' })).not.toThrow()
    })

    it('renders the title and a message, falling back to a default message', () => {
        const panel = new VRPlaceholderPanel({ title: 'More Settings' })

        expect(panel.container).toBeInstanceOf(Container)
        expect(panel.container.children).toHaveLength(2)
    })

    it('renders a custom message when provided', () => {
        const panel = new VRPlaceholderPanel({ title: 'X', message: 'custom message' })

        expect(panel.container.children).toHaveLength(2)
    })
})

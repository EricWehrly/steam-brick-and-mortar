import { describe, it, expect } from 'vitest'
import { DOMUtils } from '../../../src/utils/DOMUtils'

describe('DOMUtils.isEditableElement', () => {
    it('returns true for an input element', () => {
        expect(DOMUtils.isEditableElement(document.createElement('input'))).toBe(true)
    })

    it('returns true for a textarea element', () => {
        expect(DOMUtils.isEditableElement(document.createElement('textarea'))).toBe(true)
    })

    it('returns true for a contenteditable element', () => {
        const div = document.createElement('div')
        div.contentEditable = 'true'

        expect(DOMUtils.isEditableElement(div)).toBe(true)
    })

    it('returns false for a non-editable element', () => {
        expect(DOMUtils.isEditableElement(document.createElement('button'))).toBe(false)
        expect(DOMUtils.isEditableElement(document.body)).toBe(false)
    })

    it('returns false for null', () => {
        expect(DOMUtils.isEditableElement(null)).toBe(false)
    })
})

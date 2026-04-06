import { describe, it, expect, vi } from 'vitest';
import { UICheckbox } from '../../../src/ui/components/UICheckbox';

describe('UICheckbox', () => {
    it('renders a label with correct text', () => {
        const checkbox = UICheckbox.create({
            label: 'Test Checkbox',
            onChange: () => {}
        });
        
        const labelText = checkbox.querySelector('.ui-checkbox-text');
        expect(labelText?.textContent).toBe('Test Checkbox');
    });

    it('checked option sets input as checked', () => {
        const checkbox = UICheckbox.create({
            label: 'Checked',
            checked: true,
            onChange: () => {}
        });
        
        const input = checkbox.querySelector('input') as HTMLInputElement;
        expect(input.checked).toBe(true);
    });

    it('disabled option disables input', () => {
        const checkbox = UICheckbox.create({
            label: 'Disabled',
            disabled: true,
            onChange: () => {}
        });
        
        const input = checkbox.querySelector('input') as HTMLInputElement;
        expect(input.disabled).toBe(true);
        expect(checkbox.classList.contains('ui-checkbox-container--disabled')).toBe(true);
    });

    it('onChange fires when input changes', () => {
        const onChange = vi.fn();
        const checkbox = UICheckbox.create({
            label: 'Toggle Me',
            onChange
        });
        
        const input = checkbox.querySelector('input') as HTMLInputElement;
        
        // Simulate change event
        input.checked = true;
        input.dispatchEvent(new Event('change'));
        
        expect(onChange).toHaveBeenCalledWith(true);
        
        input.checked = false;
        input.dispatchEvent(new Event('change'));
        
        expect(onChange).toHaveBeenCalledWith(false);
    });
});

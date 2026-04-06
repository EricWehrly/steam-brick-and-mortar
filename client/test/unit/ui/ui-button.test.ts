import { describe, it, expect, vi } from 'vitest';
import { UIButton } from '../../../src/ui/components/UIButton';

describe('UIButton', () => {
    it('creates a button with expected base and variant class', () => {
        const button = UIButton.create({
            label: 'Test Button',
            onClick: () => {}
        });
        
        expect(button.tagName).toBe('BUTTON');
        expect(button.classList.contains('ui-button')).toBe(true);
        expect(button.innerText).toBe('Test Button');
    });

    it('applies the primary variant class', () => {
        const button = UIButton.create({
            label: 'Primary',
            variant: 'primary',
            onClick: () => {}
        });
        
        expect(button.classList.contains('ui-button--primary')).toBe(true);
    });

    it('renders as disabled and does not trigger onClick', () => {
        const onClick = vi.fn();
        const button = UIButton.create({
            label: 'Disabled',
            disabled: true,
            onClick
        });
        
        expect(button.disabled).toBe(true);
        
        // Simulating click - browser would usually block this for native disabled button,
        // but we verify the event listener logic or just the property.
        button.click();
        expect(onClick).not.toHaveBeenCalled();
    });

    it('triggers onClick when clicked', () => {
        const onClick = vi.fn();
        const button = UIButton.create({
            label: 'Click Me',
            onClick
        });
        
        button.click();
        expect(onClick).toHaveBeenCalledTimes(1);
    });
});

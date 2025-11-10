# UIComponentUtils API Documentation

Utility class for declarative UI component configuration. Reduces boilerplate for common DOM event patterns.

## Installation

```typescript
import { UIComponentUtils } from '../../../utils/UIComponentUtils'
```

## Interfaces

### SliderConfig
```typescript
interface SliderConfig {
    sliderId: string              // Element ID of the slider input
    valueDisplayId: string        // Element ID where value is displayed
    onInput?: (value: number) => void    // Called during drag (live updates)
    onChange?: (value: number) => void   // Called when drag completes
    formatDisplay?: (value: number) => string  // Custom value formatting
}
```

### ToggleConfig
```typescript
interface ToggleConfig {
    toggleId: string              // Element ID of checkbox/toggle
    onChange: (checked: boolean) => void  // Called when state changes
}
```

### ButtonConfig
```typescript
interface ButtonConfig {
    buttonId: string              // Element ID of button
    onClick: () => void           // Called on click
}
```

## Interfaces

All configuration interfaces support type-safe value handling:

```typescript
interface SliderConfig { sliderId, valueDisplayId, onInput?, onChange?, formatDisplay? }
interface ToggleConfig { toggleId, onChange }
interface ButtonConfig { buttonId, onClick }
interface SelectConfig<T> { selectId, onChange, parseValue? }
interface InputConfig<T> { inputId, onChange, parseValue? }
```

## Methods

### setupSlider(container, config)
Configure a single slider with value display and callbacks.

**Parameters:**
- `container: HTMLElement | null` - Parent element to search within
- `config: SliderConfig` - Slider configuration

**Example:**
```typescript
UIComponentUtils.setupSlider(this.container, {
    sliderId: 'camera-fov',
    valueDisplayId: 'camera-fov-value',
    formatDisplay: (v) => v.toFixed(0) + '°',
    onChange: (value) => {
        camera.fov = value
        camera.updateProjectionMatrix()
    }
})
```

### setupSliders(container, configs)
Configure multiple sliders at once.

**Parameters:**
- `container: HTMLElement | null` - Parent element to search within
- `configs: SliderConfig[]` - Array of slider configurations

**Example:**
```typescript
UIComponentUtils.setupSliders(this.container, [
    {
        sliderId: 'fov',
        valueDisplayId: 'fov-value',
        formatDisplay: (v) => v + '°',
        onChange: (v) => this.updateFOV(v)
    },
    {
        sliderId: 'near-clip',
        valueDisplayId: 'near-value',
        formatDisplay: (v) => v.toFixed(2),
        onChange: (v) => this.updateNearClip(v)
    }
])
```

### setupButton(container, config)
Configure a single button with click handler.

**Parameters:**
- `container: HTMLElement | null` - Parent element to search within
- `config: ButtonConfig` - Button configuration

**Example:**
```typescript
UIComponentUtils.setupButton(this.container, {
    buttonId: 'reset-btn',
    onClick: () => this.resetToDefaults()
})
```

### setupButtons(container, configs)
Configure multiple buttons at once.

**Parameters:**
- `container: HTMLElement | null` - Parent element to search within
- `configs: ButtonConfig[]` - Array of button configurations

**Example:**
```typescript
UIComponentUtils.setupButtons(this.container, [
    { buttonId: 'save-btn', onClick: () => this.save() },
    { buttonId: 'cancel-btn', onClick: () => this.cancel() },
    { buttonId: 'reset-btn', onClick: () => this.reset() }
])
```

### setupToggle(container, config)
Configure a single checkbox/toggle with change handler.

**Parameters:**
- `container: HTMLElement | null` - Parent element to search within
- `config: ToggleConfig` - Toggle configuration

**Example:**
```typescript
UIComponentUtils.setupToggle(this.container, {
    toggleId: 'enable-feature',
    onChange: (checked) => this.setFeatureEnabled(checked)
})
```

### setupToggles(container, configs)
Configure multiple toggles at once.

**Parameters:**
- `container: HTMLElement | null` - Parent element to search within
- `configs: ToggleConfig[]` - Array of toggle configurations

**Example:**
```typescript
UIComponentUtils.setupToggles(this.container, [
    {
        toggleId: 'enable-lighting',
        onChange: (checked) => this.setLighting(checked)
    },
    {
        toggleId: 'show-debug',
        onChange: (checked) => this.setDebug(checked)
    }
])
```

### setupDataButtons<T>(container, selector, dataAttribute, onClick)
Configure buttons using data attributes. Useful for preset systems or dynamic button groups.

**Parameters:**
- `container: HTMLElement | null` - Parent element to search within
- `selector: string` - CSS selector for buttons
- `dataAttribute: string` - Name of data attribute (without 'data-' prefix)
- `onClick: (value: T, button: HTMLElement) => void` - Callback with attribute value

**Example:**
```typescript
// HTML: <button data-preset="NORMAL">Normal</button>
UIComponentUtils.setupDataButtons(
    this.container,
    '[data-preset]',
    'preset',
    (presetKey: string) => {
        this.applyPreset(presetKey)
    }
)
```

### updateSliderValue(container, sliderId, valueDisplayId, value, formatDisplay?)
Programmatically update slider value and display.

**Parameters:**
- `container: HTMLElement | null` - Parent element
- `sliderId: string` - Element ID of slider
- `valueDisplayId: string` - Element ID of value display
- `value: number` - New value to set
- `formatDisplay?: (value: number) => string` - Optional formatter

**Example:**
```typescript
UIComponentUtils.updateSliderValue(
    this.container,
    'camera-fov',
    'camera-fov-value',
    90,
    (v) => v + '°'
)
```

### setupSelect<T>(container, config)
Configure a select dropdown with type-safe value handling.

**Example:**
```typescript
UIComponentUtils.setupSelect<'low' | 'medium' | 'high'>(this.container, {
    selectId: 'quality-select',
    onChange: (value) => this.updateQuality(value)
})
```

### setupSelects<T>(container, configs)
Batch configure multiple selects.

### setupInput<T>(container, config)
Configure text/number inputs with optional value parsing.

**Example:**
```typescript
UIComponentUtils.setupInput<number>(this.container, {
    inputId: 'max-items',
    parseValue: (v) => parseInt(v, 10),
    onChange: (value) => this.setMaxItems(value)
})
```

### setupInputs<T>(container, configs)
Batch configure multiple inputs.

## Common Patterns

### Slider with Live Preview
Use `onInput` for live updates during drag:
```typescript
{
    sliderId: 'volume',
    valueDisplayId: 'volume-value',
    formatDisplay: (v) => v + '%',
    onInput: (value) => this.previewVolume(value),  // Live preview
    onChange: (value) => this.saveVolume(value)     // Save on release
}
```

### Slider with Only Final Value
Omit `onInput` to update display without callbacks:
```typescript
{
    sliderId: 'quality',
    valueDisplayId: 'quality-value',
    formatDisplay: (v) => this.getQualityLabel(v),
    onChange: (value) => this.applyQuality(value)  // Only called on release
}
```

### Button Groups with Data Attributes
Perfect for preset systems or tab-like interfaces:
```typescript
// HTML:
// <button data-quality="low">Low</button>
// <button data-quality="medium">Medium</button>
// <button data-quality="high">High</button>

UIComponentUtils.setupDataButtons(
    this.container,
    '[data-quality]',
    'quality',
    (quality) => this.setQuality(quality)
)
```

## Error Handling

All methods safely handle:
- Null containers
- Missing DOM elements
- Invalid selectors

No exceptions thrown - failed operations are silently ignored.

## Performance Considerations

- Event listeners are added once per setup call
- No cleanup methods provided (listeners persist with element lifecycle)
- Consider debouncing for performance-sensitive `onInput` callbacks
- Batch operations (`setupSliders`, `setupToggles`) are more efficient than individual calls

## Migration Guide

### From Manual Event Listeners

**Before:**
```typescript
const slider = document.getElementById('my-slider') as HTMLInputElement
const value = document.getElementById('my-value') as HTMLSpanElement
if (slider && value) {
    slider.addEventListener('input', (e) => {
        const v = (e.target as HTMLInputElement).value
        value.textContent = v
    })
    slider.addEventListener('change', (e) => {
        this.updateSetting(parseFloat((e.target as HTMLInputElement).value))
    })
}
```

**After:**
```typescript
UIComponentUtils.setupSlider(document.body, {
    sliderId: 'my-slider',
    valueDisplayId: 'my-value',
    onChange: (value) => this.updateSetting(value)
})
```

### From querySelector Chains

**Before:**
```typescript
this.container?.querySelector('#btn1')?.addEventListener('click', () => this.action1())
this.container?.querySelector('#btn2')?.addEventListener('click', () => this.action2())
```

**After:**
```typescript
UIComponentUtils.setupButtons(this.container, [
    { buttonId: 'btn1', onClick: () => this.action1() },
    { buttonId: 'btn2', onClick: () => this.action2() }
])
```

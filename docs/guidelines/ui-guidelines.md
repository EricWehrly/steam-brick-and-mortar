# UI Development Guidelines

## Core Principles

### Template Pattern
- **ALL UI components must use external HTML templates** - never embed HTML strings in TypeScript
- Templates live in `src/templates/` with logical subfolder organization
- Import templates using `?raw` suffix: `import template from './template.html?raw'`
- Use `renderTemplate()` from `TemplateEngine` for dynamic content

### Code Organization
- Keep TypeScript files focused on logic, not markup
- Use meaningful template data objects with clear property names
- Template variables should match TypeScript interface properties when possible

### Documentation Standards
- **No redundant JavaDoc comments** - good naming and types should be self-documenting
- Only add comments when they explain **why**, not **what**
- Avoid obvious comments like `/** Get current settings */` for `getSettings()`

### Method Implementation
- **Remove empty methods** - don't implement lifecycle methods unless they do something
- Use meaningful default implementations in base classes instead of empty overrides
- If a method truly needs to exist but do nothing, add a comment explaining why

## Template Structure

### File Organization
```
src/templates/
├── pause-menu/          # Pause menu panels
├── cache-management/    # Cache UI components  
├── steam-ui/           # Steam-specific interfaces
└── ui/                 # General UI components
```

### Template Variables
```typescript
// ✅ Good - Clear template data object
return renderTemplate(template, {
    autoLoadProfile: this.settings.autoLoadLastProfile,
    qualityLow: this.settings.qualityLevel === 'low',
    minimumPlaytime: this.settings.minimumPlaytime
})

// ❌ Bad - Embedded HTML strings
return `<div class="settings">...</div>`
```

### HTML Template Best Practices
```html
<!-- ✅ Good - Use semantic class names -->
<div class="setting-item">
    <label class="setting-label">
        <input type="checkbox" {{#autoLoadProfile}}checked{{/autoLoadProfile}}>
        <span class="checkmark"></span>
        Auto-load last profile
    </label>
</div>

<!-- ❌ Bad - Inline styles or unclear structure -->
<div style="margin: 10px">...</div>
```

## Code Quality Standards

### TypeScript Classes
```typescript
// ✅ Good - Clean, focused implementation
export class MyPanel extends PauseMenuPanel {
    readonly id = 'my-panel'
    readonly title = 'My Panel'
    
    render(): string {
        return renderTemplate(myPanelTemplate, {
            setting1: this.settings.setting1,
            setting2: this.settings.setting2
        })
    }
    
    attachEvents(): void {
        // Only implement if there are actually events to attach
    }
}

// ❌ Bad - Redundant comments and empty methods
export class MyPanel extends PauseMenuPanel {
    /**
     * Get the panel ID
     */
    readonly id = 'my-panel'
    
    /**
     * Render the panel HTML
     */
    render(): string {
        return `<div>...</div>` // Don't embed HTML!
    }
    
    onShow(): void {
        // Empty method - remove this
    }
    
    onHide(): void {
        // Empty method - remove this  
    }
}
```

### Event Handling
- Group related event attachments into private methods
- Use consistent naming: `attachCheckboxEvents()`, `attachButtonEvents()`, etc.
- Always check for element existence before adding listeners

### Settings Management
- Use TypeScript interfaces for settings objects
- Implement localStorage persistence consistently
- Provide meaningful default values
- Use `Partial<Settings>` for update methods

## Template Engine Usage

### Basic Template Rendering
```typescript
import { renderTemplate } from '../utils/TemplateEngine'
import myTemplate from '../templates/my-component.html?raw'

// Simple substitution
return renderTemplate(myTemplate, {
    title: 'My Title',
    isActive: true
})
```

### Conditional Rendering
```html
<!-- In template -->
<input type="checkbox" {{#isChecked}}checked{{/isChecked}}>
<div class="{{#isActive}}active{{/isActive}} panel">
```

### Lists and Iteration
```html
<!-- In template -->
{{#items}}
<div class="item">{{name}}: {{value}}</div>
{{/items}}
```

## Common Patterns

### Settings Panel Structure
1. Import template and dependencies
2. Define settings interface
3. Implement render() with template data
4. Group event handlers logically
5. Provide persistence methods
6. Implement refresh() for dynamic updates

### Error Handling
- Always wrap localStorage operations in try/catch
- Provide fallback values for missing settings
- Log warnings for non-critical failures
- Use meaningful error messages

## Migration Checklist

When refactoring existing UI components:
- [ ] Extract HTML to external template file
- [ ] Remove redundant JavaDoc comments
- [ ] Remove empty lifecycle methods
- [ ] Group event handlers into logical methods
- [ ] Use consistent naming patterns
- [ ] Add TypeScript interfaces for data structures
- [ ] Implement proper error handling
- [ ] Test template rendering with various data states

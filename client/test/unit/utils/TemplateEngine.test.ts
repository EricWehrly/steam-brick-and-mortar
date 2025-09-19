import { describe, it, expect } from 'vitest'
import { interpolateTemplate, renderTemplate, type TemplateValues } from '../../../src/utils/TemplateEngine'

describe('TemplateEngine', () => {
    describe('interpolateTemplate', () => {
        describe('simple interpolation', () => {
            it('should replace basic template placeholders with values', () => {
                const template = 'Hello {{name}}!'
                const values = { name: 'World' }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('Hello World!')
            })

            it('should handle multiple placeholders', () => {
                const template = '{{greeting}} {{name}}, you have {{count}} messages'
                const values = { greeting: 'Hello', name: 'John', count: 5 }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('Hello John, you have 5 messages')
            })

            it('should handle numeric values', () => {
                const template = 'Price: ${{price}}'
                const values = { price: 19.99 }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('Price: $19.99')
            })

            it('should handle boolean values', () => {
                const template = 'Active: {{isActive}}'
                const values = { isActive: true }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('Active: true')
            })

            it('should return empty string for undefined values', () => {
                const template = 'Hello {{name}}!'
                const values = {}
                const result = interpolateTemplate(template, values)
                expect(result).toBe('Hello !')
            })

            it('should handle templates with no placeholders', () => {
                const template = 'Static content'
                const values = { name: 'Test' }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('Static content')
            })
        })

        describe('conditional blocks - if only', () => {
            it('should show content when condition is truthy', () => {
                const template = '{{#if showMessage}}Message is visible{{/if}}'
                const values = { showMessage: true }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('Message is visible')
            })

            it('should hide content when condition is falsy', () => {
                const template = '{{#if showMessage}}Message is visible{{/if}}'
                const values = { showMessage: false }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('')
            })

            it('should hide content when condition is undefined', () => {
                const template = '{{#if showMessage}}Message is visible{{/if}}'
                const values = {}
                const result = interpolateTemplate(template, values)
                expect(result).toBe('')
            })

            it('should handle multiline conditional content', () => {
                const template = `{{#if showDetails}}
                    <div>
                        <p>Details here</p>
                    </div>
                {{/if}}`
                const values = { showDetails: true }
                const result = interpolateTemplate(template, values)
                expect(result).toContain('<div>')
                expect(result).toContain('<p>Details here</p>')
            })

            it('should handle nested HTML in conditional blocks', () => {
                const template = '{{#if isUser}}<span class="user-label">User Account</span>{{/if}}'
                const values = { isUser: true }
                const result = interpolateTemplate(template, values)
                expect(result).toContain('<span class="user-label">User Account</span>')
            })

            it('should handle whitespace in conditional blocks', () => {
                const template = '{{#if   hasSpace   }}   Content with spaces   {{/if}}'
                const values = { hasSpace: true }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('   Content with spaces   ')
            })
        })

        describe('attribute helpers', () => {
            it('should add selected attribute when condition is true', () => {
                const template = '<option {{#selected isSelected}}selected{{/selected}}>Item</option>'
                const values = { isSelected: true }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('<option selected>Item</option>')
            })

            it('should omit selected attribute when condition is false', () => {
                const template = '<option {{#selected isSelected}}selected{{/selected}}>Item</option>'
                const values = { isSelected: false }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('<option >Item</option>')
            })

            it('should add checked attribute when condition is true', () => {
                const template = '<input type="checkbox" {{#checked isChecked}}checked{{/checked}}>'
                const values = { isChecked: true }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('<input type="checkbox" checked>')
            })

            it('should omit checked attribute when condition is false', () => {
                const template = '<input type="checkbox" {{#checked isChecked}}checked{{/checked}}>'
                const values = { isChecked: false }
                const result = interpolateTemplate(template, values)
                expect(result).toBe('<input type="checkbox" >')
            })
        })

        describe('complex scenarios', () => {
            it('should handle mixed interpolation and conditionals', () => {
                const template = `
                    <h1>{{title}}</h1>
                    {{#if showContent}}
                        <p>{{content}}</p>
                    {{/if}}
                `
                const values = { title: 'Test Page', showContent: true, content: 'This is content' }
                const result = interpolateTemplate(template, values)
                expect(result).toContain('<h1>Test Page</h1>')
                expect(result).toContain('<p>This is content</p>')
            })

            it('should handle multiple conditional blocks', () => {
                const template = `
                    <header>{{#if showHeader}}Header{{/if}}</header>
                    {{#if showMain}}
                        <main>Main content</main>
                    {{/if}}
                    {{#if showLoading}}
                        <div>Loading...</div>
                    {{/if}}
                    <footer>{{#if showFooter}}Footer{{/if}}</footer>
                `
                const values = { showHeader: true, showMain: false, showLoading: true, showFooter: true }
                const result = interpolateTemplate(template, values)
                expect(result).toContain('<header>Header</header>')
                expect(result).toContain('<div>Loading...</div>')
                expect(result).toContain('<footer>Footer</footer>')
                expect(result).not.toContain('<main>Main content</main>')
            })

            it('should handle complex HTML with attributes', () => {
                const template = `<select>
                    <option {{#selected optionA}}selected{{/selected}} value="a">Option A</option>
                    <option {{#selected optionB}}selected{{/selected}} value="b">Option B</option>
                </select>`
                const values = { optionA: false, optionB: true }
                const result = interpolateTemplate(template, values)
                expect(result).toContain('<option  value="a">Option A</option>')
                expect(result).toContain('<option selected value="b">Option B</option>')
            })

            it('should handle the real world use-case', () => {
                const template = `<div class="cache-section">\r\n    <div class="cache-stats" id="cache-stats">\r\n        {{#if cacheApiUnavailable}}\r\n        <div class="stat-item error">\r\n            <span class="stat-label">Browser Cache API:</span>\r\n            <span class="stat-value">{{cacheApiStatus}}</span>\r\n        </div>\r\n        {{else}}\r\n        <div class="stat-item">\r\n            <span class="stat-label">Images Cached:</span>\r\n            <span class="stat-value" id="cache-image-count">{{imageCount}}</span>\r\n        </div>\r\n        <div class="stat-item">\r\n            <span class="stat-label">Last Updated:</span>\r\n            <span class="stat-value" id="cache-last-update">{{lastUpdate}}</span>\r\n        </div>\r\n        <div class="stat-item">\r\n            <span class="stat-label">Storage Quota:</span>\r\n            <span class="stat-value" id="storage-quota">{{storageQuota}}</span>\r\n        </div>\r\n        {{/if}}\r\n    </div>\r\n</div>\r\n\r\n<div class="cache-section">\r\n    <h4>Cached Image Previewer</h4>\r\n    {{#if hasImages}}\r\n    <div class="image-previewer" id="image-previewer">\r\n        <div class="previewer-controls">\r\n            <button class="cache-btn cache-btn-secondary" id="initialize-previewer-btn">\r\n                🖼️ Initialize Preview\r\n            </button>\r\n            <div class="previewer-navigation" id="previewer-navigation" style="display: none;">\r\n                <button class="nav-btn" id="prev-image-btn" aria-label="Previous image">\r\n                    ◀\r\n                </button>\r\n                <div class="image-counter">\r\n                    <input type="number" id="image-index-input" min="1" max="{{imageCount}}" value="1" class="index-input">\r\n                    <span class="counter-separator">of</span>\r\n                    <span id="total-images">{{imageCount}}</span>\r\n                </div>\r\n                <button class="nav-btn" id="next-image-btn" aria-label="Next image">\r\n                    ▶\r\n                </button>\r\n            </div>\r\n        </div>\r\n        <div class="image-preview-container" id="image-preview-container" style="display: none;">\r\n            <img id="preview-image" class="preview-image" alt="Cached game image" />\r\n            <div class="image-info">\r\n                <span id="image-name" class="image-name"></span>\r\n                <span id="image-size" class="image-size"></span>\r\n            </div>\r\n        </div>\r\n    </div>\r\n    {{else}}\r\n    <div class="no-images-message">\r\n        <p>No cached images available for preview.</p>\r\n    </div>\r\n    {{/if}}\r\n</div>\r\n\r\n<div class="cache-section">\r\n    <h4>Load from Cached Users</h4>\r\n    <div class="cached-users" id="cached-users">\r\n        <select id="cached-users-select" class="cached-users-select">\r\n            <option value="">Select a cached user...</option>\r\n            {{cachedUsersOptions}}\r\n        </select>\r\n        <button class="cache-btn cache-btn-primary" id="load-cached-user-btn" disabled>\r\n            📋 Load Selected User\r\n        </button>\r\n    </div>\r\n</div>\r\n\r\n<div class="cache-section">\r\n    <div class="cache-actions">\r\n        <button class="cache-btn cache-btn-primary" id="refresh-cache-btn" {{refreshButtonDisabled}}>\r\n            🔄 Refresh Cache\r\n        </button>\r\n        <button class="cache-btn cache-btn-secondary" id="clear-cache-btn" {{clearButtonDisabled}}>\r\n            🗑️ Clear Cache\r\n        </button>\r\n        <button class="cache-btn cache-btn-secondary" id="download-missing-btn" {{downloadButtonDisabled}}>\r\n            📥 Download Missing\r\n        </button>\r\n    </div>\r\n</div>\r\n\r\n<div class="cache-section">\r\n    <div class="cache-settings">\r\n        <div class="setting-item">\r\n            <label for="auto-download-toggle">\r\n                <input type="checkbox" id="auto-download-toggle" {{autoDownloadChecked}}>\r\n                Auto-download missing images\r\n            </label>\r\n        </div>\r\n        <div class="setting-item">\r\n            <label for="cache-limit-input">\r\n                Max cache size (MB):\r\n                <input type="number" id="cache-limit-input" value="{{cacheLimitValue}}" min="100" max="5000" step="100">\r\n            </label>\r\n        </div>\r\n        <div class="setting-item">\r\n            <label for="preload-toggle">\r\n                <input type="checkbox" id="preload-toggle" {{preloadChecked}}>\r\n                Preload next page images\r\n            </label>\r\n        </div>\r\n    </div>\r\n</div>\r\n`;

                // Test with cache API unavailable (should show error message)
                const values1 = { 
                    cacheApiUnavailable: true,
                    cacheApiStatus: 'Not Available',
                    hasImages: false
                }
                const result1 = interpolateTemplate(template, values1)
                expect(result1).toContain('Browser Cache API:')
                expect(result1).toContain('Not Available')
                expect(result1).not.toContain('Images Cached:')
                expect(result1).toContain('No cached images available for preview')

                // Test with cache API available and has images
                const values2 = {
                    cacheApiUnavailable: false,
                    imageCount: 42,
                    lastUpdate: '2023-12-01',
                    storageQuota: '1.2 GB',
                    hasImages: true,
                    cachedUsersOptions: '<option value="testuser">Test User (5 games)</option>',
                    refreshButtonDisabled: '',
                    clearButtonDisabled: '',
                    downloadButtonDisabled: 'disabled',
                    autoDownloadChecked: 'checked',
                    cacheLimitValue: 500,
                    preloadChecked: ''
                }
                const result2 = interpolateTemplate(template, values2)
                expect(result2).not.toContain('Browser Cache API:')
                expect(result2).toContain('Images Cached:')
                expect(result2).toContain('42')
                expect(result2).toContain('2023-12-01')
                expect(result2).toContain('1.2 GB')
                expect(result2).toContain('🖼️ Initialize Preview')
                expect(result2).not.toContain('No cached images available for preview')
            })
        })
    })

    describe('renderTemplate', () => {
        it('should be an alias for interpolateTemplate', () => {
            const template = 'Hello {{name}}!'
            const values = { name: 'World' }
            const result = renderTemplate(template, values)
            expect(result).toBe('Hello World!')
        })
    })
})
/**
 * VRCacheManagementPanel - pass 1 (layout only) structural tests. No live data or click handlers
 * to exercise yet - see the panel's own top comment for the domain survey and what pass 2/3 still
 * need to wire up.
 */

import { describe, it, expect } from 'vitest'
import { VRCacheManagementPanel } from '../../../../../src/scene/uikit/panels/VRCacheManagementPanel'

describe('VRCacheManagementPanel', () => {
    it('constructs a real uikit component tree without throwing', () => {
        expect(() => new VRCacheManagementPanel()).not.toThrow()
    })

    it('exposes its root container for the tab shell to mount', () => {
        const panel = new VRCacheManagementPanel()
        expect(panel.container).toBeDefined()
    })
})

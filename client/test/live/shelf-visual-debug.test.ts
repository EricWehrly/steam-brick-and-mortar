/**
 * LIVE TEST: Visual debugging of shelf depths in actual running app
 * Run this while the app is running to see shelf measurements in console
 * 
 * To use: Start the app, then this test will log shelf positions to console
 */

import { describe, it } from 'vitest'

describe('LIVE: Shelf Visual Debug (run while app is running)', () => {
    it('should log instructions for manual inspection', () => {
        console.log('\n================================')
        console.log('SHELF DEPTH VISUAL DEBUG INSTRUCTIONS')
        console.log('================================\n')
        
        console.log('1. Start the app with: yarn dev')
        console.log('2. Open browser console (F12)')
        console.log('3. Paste this code to measure shelf units:\n')
        
        console.log(`
// Find all shelf units in the scene
const scene = window.app?.sceneManager?.scene;
if (!scene) {
    console.error('Scene not found! Make sure app is loaded.');
} else {
    const shelves = [];
    scene.traverse((obj) => {
        if (obj.name && obj.name.includes('shelf')) {
            shelves.push(obj);
        }
    });
    
    console.log(\`Found \${shelves.length} shelf-related objects\`);
    
    // Find one shelf unit and measure it
    const shelfUnit = shelves.find(s => s.children.length > 5);
    if (shelfUnit) {
        console.log('\\n=== MEASURING SHELF UNIT ===');
        console.log('Looking for horizontal shelves (small Y, large Z)...');
        
        const measurements = [];
        shelfUnit.traverse((child) => {
            if (child.geometry?.parameters) {
                const p = child.geometry.parameters;
                const pos = new THREE.Vector3();
                child.getWorldPosition(pos);
                
                // Find horizontal shelves
                if (p.height < 0.1 && p.depth > 0.3) {
                    measurements.push({
                        y: pos.y.toFixed(2),
                        z: pos.z.toFixed(2),
                        depth: p.depth.toFixed(2),
                        frontEdge: (pos.z + p.depth/2).toFixed(2)
                    });
                }
            }
        });
        
        measurements.sort((a,b) => a.y - b.y);
        console.log('\\nShelves from BOTTOM to TOP:');
        measurements.forEach((m, i) => {
            const label = i === 0 ? 'BOTTOM' : i === measurements.length-1 ? 'TOP' : 'MIDDLE';
            console.log(\`  \${label}: Y=\${m.y}, Z=\${m.z}, depth=\${m.depth}, front=\${m.frontEdge}\`);
        });
        
        console.log('\\nEXPECTED: Bottom shelf should have LARGEST front edge value');
        console.log('IF BUG: Top shelf has largest front edge value instead');
    }
}
        `.trim())
        
        console.log('\n4. Check the output:')
        console.log('   - CORRECT: Bottom shelf has largest "front" value')
        console.log('   - BUG: Top shelf has largest "front" value\n')
    })
})

const fs = require('fs');
const file = 'C:/Users/e_weh/Dropbox/Projects/steam-brick-and-mor2/client/src/scene/LightingRenderer.ts';
let content = fs.readFileSync(file, 'utf-8');
const target1 =         // Re-apply existing debug/toggle states to the new light arrays\n        const currentLightState = this.lights.length > 0 ? this.lights[0].visible : true\n        const currentDebugState = this.helpers.length > 0 ? this.helpers[0].visible : false\n\n        this.toggleLighting(currentLightState)\n        this.toggleDebugHelpers(currentDebugState);
const repl1 =         // Keep light states intact\n        const lightsWereOff = this.lights.some(l => !l.visible)\n        const helpersWereOn = this.helpers.some(h => h.visible)\n\n        if (lightsWereOff) this.toggleLighting(false)\n        if (helpersWereOn) this.toggleDebugHelpers(true);
content = content.replace(target1, repl1);
fs.writeFileSync(file, content);
console.log('Success');


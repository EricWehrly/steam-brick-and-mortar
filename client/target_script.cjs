const fs = require('fs');
const file = 'C:/Users/e_weh/Dropbox/Projects/steam-brick-and-mor2/client/src/scene/LightingRenderer.ts';
let content = fs.readFileSync(file, 'utf-8');

const idx1 = content.indexOf('this.configureShadows()');
const idx2 = content.indexOf('LightingRenderer.logger.debug', idx1);

if (idx1 !== -1 && idx2 !== -1) {
  content = content.slice(0, idx2) + '        // Ensure proper state when enhanced lighting takes over\n        this.toggleLighting(true)\n        this.toggleDebugHelpers(false)\n\n        ' + content.slice(idx2);
  fs.writeFileSync(file, content);
  console.log('Success');
} else { console.log('Failed'); }

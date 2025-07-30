/**
 * HelpPanel - Display controls and help information in pause menu
 */

import { PauseMenuPanel, type PauseMenuPanelConfig } from '../PauseMenuPanel'
import '../../../styles/pause-menu/help-panel.css'

export class HelpPanel extends PauseMenuPanel {
    readonly id = 'help'
    readonly title = 'Help & Controls'
    readonly icon = '❓'

    constructor(config: PauseMenuPanelConfig = {}) {
        super(config)
    }

    render(): string {
        return `
            <div class="help-section">
                <h4>🎮 Movement Controls</h4>
                <div class="control-list">
                    <div class="control-item">
                        <span class="control-key">W A S D</span>
                        <span class="control-desc">Move around</span>
                    </div>
                    <div class="control-item">
                        <span class="control-key">Mouse</span>
                        <span class="control-desc">Look around</span>
                    </div>
                    <div class="control-item">
                        <span class="control-key">Click</span>
                        <span class="control-desc">Interact with games</span>
                    </div>
                </div>
            </div>

            <div class="help-section">
                <h4>⚙️ System Controls</h4>
                <div class="control-list">
                    <div class="control-item">
                        <span class="control-key">Escape</span>
                        <span class="control-desc">Open/close pause menu</span>
                    </div>
                    <div class="control-item">
                        <span class="control-key">F</span>
                        <span class="control-desc">Toggle fullscreen</span>
                    </div>
                    <div class="control-item">
                        <span class="control-key">Tab</span>
                        <span class="control-desc">Toggle UI panels</span>
                    </div>
                </div>
            </div>

            <div class="help-section">
                <h4>🥽 VR Controls</h4>
                <div class="control-list">
                    <div class="control-item">
                        <span class="control-key">VR Controllers</span>
                        <span class="control-desc">Point and select games</span>
                    </div>
                    <div class="control-item">
                        <span class="control-key">Room Scale</span>
                        <span class="control-desc">Walk around naturally</span>
                    </div>
                    <div class="control-item">
                        <span class="control-key">Grip Buttons</span>
                        <span class="control-desc">Navigate UI menus</span>
                    </div>
                </div>
            </div>

            <div class="help-section">
                <h4>🛠️ Troubleshooting</h4>
                <div class="help-text">
                    <p><strong>Game images not loading?</strong><br>
                    Try refreshing the cache in the Cache Management panel.</p>
                    
                    <p><strong>Performance issues?</strong><br>
                    Check the performance monitor (top-left) and lower graphics settings if needed.</p>
                    
                    <p><strong>VR not working?</strong><br>
                    Make sure your VR headset is connected and SteamVR is running.</p>
                    
                    <p><strong>Steam integration issues?</strong><br>
                    Check your Steam profile settings and ensure it's public.</p>
                </div>
            </div>

            <div class="help-section">
                <h4>ℹ️ About</h4>
                <div class="help-text">
                    <p>Steam Brick and Mortar - A WebXR virtual game store experience.</p>
                    <p>Browse your Steam library in a immersive 3D environment.</p>
                    <p>Built with Three.js, WebXR, and lots of ❤️</p>
                </div>
            </div>
        `
    }

    attachEvents(): void {
        // No interactive elements in this basic help panel
    }

    onShow(): void {
        // Panel shown - no special actions needed
    }

    onHide(): void {
        // Panel hidden - no special actions needed
    }

    dispose(): void {
        super.dispose()
    }
}

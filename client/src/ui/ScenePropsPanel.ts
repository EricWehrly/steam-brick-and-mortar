/**
 * ScenePropsPanel
 *
 * Side-panel button in #ui-right-center-group. Lets the user choose a local
 * folder of GLB/glTF models and load them into the store scene.
 *
 * Web-tier implementation: Chromium-only (File System Access API).
 * Firefox/desktop parity lives behind the desktop app vector.
 * See docs/features/user-prop-folder.md.
 *
 * Flow:
 *   1. User clicks "Select Folder" → showDirectoryPicker() → handle stored in IndexedDB
 *   2. Each .glb/.gltf file → Blob URL → UserPropGlbReady event
 *   3. PropRenderer subscribes to UserPropGlbReady → AssetLoader.loadModel() → places model
 *
 * On subsequent page loads: handle re-acquired silently via requestPermission()
 * (Chrome 122+ persistent permissions — no picker after first grant).
 */

import { EventManager, EventSource } from '../core/EventManager'
import { StorePropsEventTypes, type UserPropGlbReadyEvent } from '../scene/props/PropsEvents'
import '../styles/components/scene-props-panel.css'

// requestPermission is part of the File System Access API but not yet in TypeScript's DOM lib
interface FileSystemHandleWithPermission extends FileSystemDirectoryHandle {
    requestPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

const DB_NAME = 'scene-props'
const DB_STORE = 'handles'
const HANDLE_KEY = 'prop-folder'

const SUPPORTED_EXTENSIONS = new Set(['.glb', '.gltf'])

export class ScenePropsPanel {
    private panelContainer: HTMLElement | null = null
    private panelContent: HTMLElement | null = null
    private isPanelVisible = false
    private folderHandle: FileSystemDirectoryHandle | null = null
    private statusEl: HTMLElement | null = null
    private loadedCount = 0

    public init(): void {
        const slot = document.getElementById('ui-right-center-group') ?? document.body
        this.buildPanel(slot)
        void this.restoreHandleFromDb()
    }

    private buildPanel(slot: HTMLElement): void {
        this.panelContainer = document.createElement('div')
        this.panelContainer.className = 'scene-props-panel-container'

        const toggle = document.createElement('button')
        toggle.className = 'scene-props-toggle-btn panel-toggle-btn'
        toggle.title = 'Scene Props'
        toggle.textContent = '📦'
        toggle.addEventListener('click', this.togglePanel.bind(this))

        this.panelContent = document.createElement('div')
        this.panelContent.className = 'scene-props-panel hidden'
        this.panelContent.innerHTML = `
            <div class="scene-props-header">Scene Props</div>
            <div class="scene-props-status"></div>
            <div class="scene-props-actions">
                <button class="scene-props-btn" id="scene-props-select">Select Folder</button>
                <button class="scene-props-btn" id="scene-props-reload" disabled>Reload Folder</button>
            </div>
            <div class="scene-props-note">Chromium only · GLB / glTF files · personal mode</div>
        `

        this.panelContainer.appendChild(toggle)
        this.panelContainer.appendChild(this.panelContent)
        slot.appendChild(this.panelContainer)

        this.statusEl = this.panelContent.querySelector('.scene-props-status')

        this.panelContent.querySelector('#scene-props-select')
            ?.addEventListener('click', this.selectFolder.bind(this))
        this.panelContent.querySelector('#scene-props-reload')
            ?.addEventListener('click', this.loadFromHandle.bind(this))

        if (!('showDirectoryPicker' in window)) {
            this.setStatus('Not supported in this browser')
            this.panelContent.querySelector<HTMLButtonElement>('#scene-props-select')!.disabled = true
        }
    }

    private togglePanel(): void {
        this.isPanelVisible = !this.isPanelVisible
        this.panelContent?.classList.toggle('hidden', !this.isPanelVisible)
    }

    private async selectFolder(): Promise<void> {
        try {
            this.folderHandle = await (window as Window & typeof globalThis & {
                showDirectoryPicker: () => Promise<FileSystemDirectoryHandle>
            }).showDirectoryPicker()
            await this.persistHandle(this.folderHandle)
            this.enableReload()
            await this.loadFromHandle()
        } catch (err) {
            if ((err as DOMException).name !== 'AbortError') {
                this.setStatus('Error selecting folder')
                console.error('ScenePropsPanel: folder selection failed', err)
            }
        }
    }

    private async loadFromHandle(): Promise<void> {
        if (!this.folderHandle) return

        const handle = this.folderHandle as FileSystemHandleWithPermission
        const permission = await handle.requestPermission({ mode: 'read' })
        if (permission !== 'granted') {
            this.setStatus('Permission denied')
            return
        }

        this.loadedCount = 0
        this.setStatus(`Scanning "${this.folderHandle.name}"…`)

        const eventManager = EventManager.getInstance()

        for await (const [name, entry] of this.folderHandle.entries()) {
            if (entry.kind !== 'file') continue
            const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
            if (!SUPPORTED_EXTENSIONS.has(ext)) continue

            const file = await (entry as FileSystemFileHandle).getFile()
            const url = URL.createObjectURL(file)

            eventManager.emit<UserPropGlbReadyEvent>(
                StorePropsEventTypes.UserPropGlbReady,
                { url, filename: name },
                EventSource.UI
            )
            this.loadedCount++
        }

        this.setStatus(
            this.loadedCount === 0
                ? `No GLB/glTF files in "${this.folderHandle.name}"`
                : `Loaded ${this.loadedCount} model${this.loadedCount === 1 ? '' : 's'} from "${this.folderHandle.name}"`
        )
    }

    private enableReload(): void {
        const btn = this.panelContent?.querySelector<HTMLButtonElement>('#scene-props-reload')
        if (btn) btn.disabled = false
    }

    private setStatus(msg: string): void {
        if (this.statusEl) this.statusEl.textContent = msg
    }

    // ── IndexedDB persistence ─────────────────────────────────────────────────

    private openDb(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1)
            req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE)
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => reject(req.error)
        })
    }

    private async persistHandle(handle: FileSystemDirectoryHandle): Promise<void> {
        const db = await this.openDb()
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readwrite')
            tx.objectStore(DB_STORE).put(handle, HANDLE_KEY)
            tx.oncomplete = () => resolve()
            tx.onerror = () => reject(tx.error)
        })
        db.close()
    }

    private async restoreHandleFromDb(): Promise<void> {
        try {
            const db = await this.openDb()
            const handle = await new Promise<FileSystemDirectoryHandle | undefined>((resolve, reject) => {
                const tx = db.transaction(DB_STORE, 'readonly')
                const req = tx.objectStore(DB_STORE).get(HANDLE_KEY)
                req.onsuccess = () => resolve(req.result as FileSystemDirectoryHandle | undefined)
                req.onerror = () => reject(req.error)
            })
            db.close()

            if (!handle) return

            const permission = await (handle as FileSystemHandleWithPermission).requestPermission({ mode: 'read' })
            if (permission !== 'granted') return

            this.folderHandle = handle
            this.enableReload()
            await this.loadFromHandle()
        } catch {
            // Silent: IndexedDB not available or no saved handle
        }
    }
}

import { EventManager, EventSource } from '../core/EventManager'
import { StorePropsEventTypes, type UserPropGlbReadyEvent } from '../scene/props/PropsEvents'
import '../styles/components/scene-props-panel.css'

// requestPermission is part of the File System Access API but not yet in TypeScript's DOM lib
interface FileSystemHandleWithPermission extends FileSystemDirectoryHandle {
    requestPermission(options: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

// showDirectoryPicker type extension — startIn accepts a handle or well-known dir name
type DirectoryPickerWindow = Window & typeof globalThis & {
    showDirectoryPicker(options?: {
        startIn?: FileSystemDirectoryHandle | 'desktop' | 'documents' | 'downloads'
    }): Promise<FileSystemDirectoryHandle>
}

const DB_NAME = 'scene-props'
const DB_STORE = 'handles'
const HANDLE_KEY = 'prop-folder'
const LAST_FOLDER_NAME_KEY = 'scene-props:last-folder-name'

const SUPPORTED_EXTENSIONS = new Set(['.glb', '.gltf'])

// The Chrome/Edge FSA enhancement tier (showDirectoryPicker + IndexedDB handle persistence)
// was carried over from the reverted Chrome-only implementation (ref 5bc935e0) without testing.
// The base <input webkitdirectory> tier is what should be validated first.
// Poor LLM instructing — do not assume the FSA path works correctly until validated.
export class ScenePropsPanel {
    private panelContainer: HTMLElement | null = null
    private panelContent: HTMLElement | null = null
    private isPanelVisible = false
    private folderHandle: FileSystemDirectoryHandle | null = null
    private statusEl: HTMLElement | null = null
    private fileInput: HTMLInputElement | null = null
    private readonly supportsFSA = 'showDirectoryPicker' in window

    public init(): void {
        const slot = document.getElementById('ui-right-center-group') ?? document.body
        this.buildPanel(slot)
        void this.tryRestore()
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
                <button class="scene-props-btn" id="scene-props-reload" disabled>Reload</button>
            </div>
            <div class="scene-props-note">GLB / glTF files · personal mode</div>
        `

        this.panelContainer.appendChild(toggle)
        this.panelContainer.appendChild(this.panelContent)
        slot.appendChild(this.panelContainer)

        this.statusEl = this.panelContent.querySelector('.scene-props-status')

        this.panelContent.querySelector('#scene-props-select')
            ?.addEventListener('click', this.selectFolder.bind(this))
        this.panelContent.querySelector('#scene-props-reload')
            ?.addEventListener('click', this.reloadFolder.bind(this))

        this.fileInput = document.createElement('input')
        this.fileInput.type = 'file'
        this.fileInput.setAttribute('webkitdirectory', '')
        this.fileInput.multiple = true
        this.fileInput.style.display = 'none'
        this.fileInput.addEventListener('change', this.handleFileInputChange.bind(this))
        document.body.appendChild(this.fileInput)
    }

    private togglePanel(): void {
        this.isPanelVisible = !this.isPanelVisible
        this.panelContent?.classList.toggle('hidden', !this.isPanelVisible)
    }

    private async selectFolder(): Promise<void> {
        if (this.supportsFSA) {
            await this.selectFolderFSA()
        } else {
            this.fileInput?.click()
        }
    }

    private async selectFolderFSA(): Promise<void> {
        try {
            const picker = window as DirectoryPickerWindow
            const handle = await picker.showDirectoryPicker(
                this.folderHandle ? { startIn: this.folderHandle } : undefined
            )
            this.folderHandle = handle
            await this.persistHandle(handle)
            await this.loadFromHandle()
        } catch (err) {
            if ((err as DOMException).name !== 'AbortError') {
                this.setStatus('Error selecting folder')
                console.error('ScenePropsPanel: folder selection failed', err)
            }
        }
    }

    private handleFileInputChange(event: Event): void {
        const files = (event.target as HTMLInputElement).files
        if (!files || files.length === 0) return

        const folderName = files[0].webkitRelativePath.split('/')[0] || 'folder'
        localStorage.setItem(LAST_FOLDER_NAME_KEY, folderName)
        this.enableReload()
        void this.loadFromFileList(files, folderName)

        // Reset so re-selecting the same folder fires change again
        ;(event.target as HTMLInputElement).value = ''
    }

    private async loadFromFileList(files: FileList, folderName: string): Promise<void> {
        this.setStatus(`Scanning "${folderName}"…`)
        let count = 0
        const eventManager = EventManager.getInstance()

        for (let i = 0; i < files.length; i++) {
            const file = files[i]
            const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
            if (!SUPPORTED_EXTENSIONS.has(ext)) continue

            eventManager.emit<UserPropGlbReadyEvent>(
                StorePropsEventTypes.UserPropGlbReady,
                { url: URL.createObjectURL(file), filename: file.name },
                EventSource.UI
            )
            count++
        }

        this.setStatus(
            count === 0
                ? `No GLB/glTF files in "${folderName}"`
                : `Loaded ${count} model${count === 1 ? '' : 's'} from "${folderName}"`
        )
    }

    private reloadFolder(): void {
        if (this.supportsFSA && this.folderHandle) {
            void this.loadFromHandle()
        } else {
            this.fileInput?.click()
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

        this.setStatus(`Scanning "${this.folderHandle.name}"…`)
        let count = 0
        const eventManager = EventManager.getInstance()

        for await (const [name, entry] of this.folderHandle.entries()) {
            if (entry.kind !== 'file') continue
            const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
            if (!SUPPORTED_EXTENSIONS.has(ext)) continue

            const file = await (entry as FileSystemFileHandle).getFile()
            eventManager.emit<UserPropGlbReadyEvent>(
                StorePropsEventTypes.UserPropGlbReady,
                { url: URL.createObjectURL(file), filename: name },
                EventSource.UI
            )
            count++
        }

        this.enableReload()
        this.setStatus(
            count === 0
                ? `No GLB/glTF files in "${this.folderHandle.name}"`
                : `Loaded ${count} model${count === 1 ? '' : 's'} from "${this.folderHandle.name}"`
        )
    }

    private async tryRestore(): Promise<void> {
        if (this.supportsFSA) {
            await this.tryRestoreHandle()
        } else {
            const name = localStorage.getItem(LAST_FOLDER_NAME_KEY)
            if (name) this.setStatus(`Last folder: "${name}" — select to reload`)
        }
    }

    private async tryRestoreHandle(): Promise<void> {
        try {
            const handle = await this.readHandleFromDb()
            if (!handle) return

            const permission = await (handle as FileSystemHandleWithPermission)
                .requestPermission({ mode: 'read' })
            if (permission !== 'granted') return

            this.folderHandle = handle
            this.enableReload()
            await this.loadFromHandle()
        } catch {
            // Silent: no saved handle or IndexedDB unavailable
        }
    }

    private enableReload(): void {
        const btn = this.panelContent?.querySelector<HTMLButtonElement>('#scene-props-reload')
        if (btn) btn.disabled = false
    }

    private setStatus(msg: string): void {
        if (this.statusEl) this.statusEl.textContent = msg
    }

    // ── IndexedDB — FSA handle persistence (Chrome/Edge only) ─────────────────

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

    private async readHandleFromDb(): Promise<FileSystemDirectoryHandle | null> {
        const db = await this.openDb()
        const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
            const tx = db.transaction(DB_STORE, 'readonly')
            const req = tx.objectStore(DB_STORE).get(HANDLE_KEY)
            req.onsuccess = () =>
                resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null)
            req.onerror = () => reject(req.error)
        })
        db.close()
        return handle
    }
}

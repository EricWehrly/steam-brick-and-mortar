/**
 * URL manipulation utilities
 */

export class UrlUtils {
    /**
     * Remove a single query parameter from a URL, leaving any others intact.
     * Drops the trailing `?` entirely if no parameters remain.
     * Returns the input unchanged if it isn't a parseable absolute URL.
     */
    static stripQueryParam(url: string, paramName: string): string {
        try {
            const parsed = new URL(url)
            parsed.searchParams.delete(paramName)
            return parsed.toString()
        } catch {
            return url
        }
    }

    /** Empty params (all flag checks below read false) when window/window.location isn't
     *  available — some test environments mock `window` as a bare object with no `location`. */
    private static getSearchParams(): URLSearchParams {
        if (typeof window === 'undefined' || !window.location) {
            return new URLSearchParams()
        }
        return new URLSearchParams(window.location.search)
    }

    /**
     * Whether frame-timing diagnostics should be active: ?diagnostics=1 directly, or ?sweep=1
     * (PerfSweep needs RenderLoopDiagnostics' capture API, so requesting a sweep implies this
     * too — checked here, not composed at each call site, so every diagnostics consumer agrees
     * on what "enabled" means). Gates RenderLoopDiagnostics, RenderPipelineManagerDebug, and
     * anything else that needs frames to keep rendering during an unattended capture — see
     * FocusCoordinator, which uses this to skip pausing the render loop on tab/window blur.
     */
    static isDiagnosticsEnabled(): boolean {
        return UrlUtils.getSearchParams().get('diagnostics') === '1' || UrlUtils.isPerfSweepEnabled()
    }

    /** Whether ?sweep=1 is present — triggers PerfSweep.run() once the scene reaches steady state. */
    static isPerfSweepEnabled(): boolean {
        return UrlUtils.getSearchParams().get('sweep') === '1'
    }

    /**
     * Whether ?debug=true is present — sets Logger's global level to DEBUG on load
     * (see Logger.ts). A separate concern from isDiagnosticsEnabled(): this controls console
     * log verbosity, not whether frame-timing instrumentation runs.
     */
    static isDebugLoggingEnabled(): boolean {
        return UrlUtils.getSearchParams().get('debug') === 'true'
    }

    /**
     * Whether ?forceVRSettingsPanel=1 is present — switches to the VR uikit menu system as the
     * only visible UI, including on flatscreen (the DOM pause menu is being phased out; this flag
     * is how it gets evaluated as the sole UI ahead of that, not just previewed alongside it - see
     * PauseMenuManager.setDomVisualsSuppressed()). SystemUICoordinator opens the real pause menu
     * at startup when this is set, so the uikit settings panel (which only ever activates via a
     * real MenuOpen - see VRSettingsPanelCoordinator) shows immediately without a manual
     * Settings/OpenMenu press, and also stands up the standalone Category Reference world-lock
     * trial (VRCategoryReferenceCoordinator).
     */
    static isVRSettingsPanelForced(): boolean {
        return UrlUtils.getSearchParams().get('forceVRSettingsPanel') === '1'
    }
}

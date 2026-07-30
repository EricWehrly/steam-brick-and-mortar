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

    /**
     * Whether ?diagnostics=1 is present on the current page URL. Gates
     * RenderLoopDiagnostics and anything else that needs frames to keep
     * rendering during an unattended capture — see FocusCoordinator, which
     * uses this to skip pausing the render loop on tab/window blur.
     */
    static isDiagnosticsEnabled(): boolean {
        return new URLSearchParams(window.location.search).get('diagnostics') === '1'
    }

    /**
     * Whether ?sweep=1 is present — triggers PerfSweep.run() once the scene reaches steady
     * state. Implies diagnostics (see SteamBrickAndMortarApp.startRenderLoop): the sweep
     * needs RenderLoopDiagnostics' capture API, so a bare ?sweep=1 is enough on its own.
     */
    static isPerfSweepEnabled(): boolean {
        return new URLSearchParams(window.location.search).get('sweep') === '1'
    }
}

/**
 * EventTypeMap — seam file for the event type registry.
 *
 * Assembles per-domain event type maps into a single `InteractionEventMap`
 * interface. Add new domain maps here as they're introduced (e.g. LightingEventMap,
 * StorePropsEventMap) rather than growing InteractionEvents.ts.
 *
 * `InteractionEvents.ts` re-exports `InteractionEventMap` from here for backward compat.
 */

// Pull in everything needed for the map entries
import type { BaseInteractionEvent } from '../core/EventManager'
import type {
    SteamEventTypes,
    SteamLoadLibraryEvent,
    SteamCacheClearEvent,
    SteamCacheStatsEvent,
    SteamImageCacheClearEvent,
    SteamDevModeToggleEvent,
    SteamDataLoadedEvent,
    SteamGameLoadedEvent,
    SteamGamesBatchEvent,
    SteamNetworkFetchProgressEvent,
    WebXREventTypes,
    WebXRToggleEvent,
    WebXRSessionStartEvent,
    WebXRSessionEndEvent,
    WebXRErrorEvent,
    WebXRSupportChangeEvent,
    InputEventTypes,
    InputPauseEvent,
    InputResumeEvent,
    UIEventTypes,
    MenuOpenEvent,
    MenuCloseEvent,
    ImageCacheStatsRequestEvent,
    GameEventTypes,
    SceneReadyEvent,
    GameStartEvent,
    ShelfLayoutDeterminedEvent,
    AppEventTypes,
    PhaseCompletedEvent,
    MilestoneEvent,
    DetailUpdateEvent,
    GameLoadingStartedEvent,
    GameLoadingPhaseChangedEvent,
    GameLoadingProgressEvent,
} from './InteractionEvents'
import type { AllBatchesCompleteEvent, GamesSortEvent, LayoutChangedEvent, SomeBatchesCompleteEvent, SortRequestedEvent, SectionsReadyEvent } from './EnvironmentEvents'

export interface InteractionEventMap {
    // Steam events
    [SteamEventTypes.LoadLibrary]: SteamLoadLibraryEvent
    [SteamEventTypes.CacheClear]: SteamCacheClearEvent
    [SteamEventTypes.CacheStats]: SteamCacheStatsEvent
    [SteamEventTypes.ImageCacheClear]: SteamImageCacheClearEvent
    [SteamEventTypes.DevModeToggle]: SteamDevModeToggleEvent
    [SteamEventTypes.DataLoaded]: SteamDataLoadedEvent
    [SteamEventTypes.GameLoaded]: SteamGameLoadedEvent
    [SteamEventTypes.GamesBatchReady]: SteamGamesBatchEvent
    [SteamEventTypes.NetworkFetchProgress]: SteamNetworkFetchProgressEvent

    // WebXR events
    [WebXREventTypes.Toggle]: WebXRToggleEvent
    [WebXREventTypes.SessionStart]: WebXRSessionStartEvent
    [WebXREventTypes.SessionEnd]: WebXRSessionEndEvent
    [WebXREventTypes.Error]: WebXRErrorEvent
    [WebXREventTypes.SupportChange]: WebXRSupportChangeEvent

    // Input events
    [InputEventTypes.Pause]: InputPauseEvent
    [InputEventTypes.Resume]: InputResumeEvent

    // UI events
    [UIEventTypes.MenuOpen]: MenuOpenEvent
    [UIEventTypes.MenuClose]: MenuCloseEvent
    [UIEventTypes.ImageCacheStatsRequest]: ImageCacheStatsRequestEvent
    [UIEventTypes.SortRequested]: SortRequestedEvent

    // Game events
    [GameEventTypes.SceneReady]: SceneReadyEvent
    [GameEventTypes.Start]: GameStartEvent
    [GameEventTypes.ShelfLayoutDetermined]: ShelfLayoutDeterminedEvent
    /** Reserved seam — no emitter yet. Wire behavior in relayout branch. */
    [GameEventTypes.LayoutChanged]: LayoutChangedEvent
    [GameEventTypes.SomeBatchesComplete]: SomeBatchesCompleteEvent

    // Environment events (from EnvironmentEvents.ts)
    [GameEventTypes.AllBatchesComplete]: AllBatchesCompleteEvent
    [GameEventTypes.GamesSort]: GamesSortEvent
    [GameEventTypes.SectionsReady]: SectionsReadyEvent

    // App events
    [AppEventTypes.PhaseStarted]: PhaseCompletedEvent
    [AppEventTypes.PhaseCompleted]: PhaseCompletedEvent
    [AppEventTypes.Milestone]: MilestoneEvent
    [AppEventTypes.DetailUpdate]: DetailUpdateEvent
    [AppEventTypes.GameLoadingStarted]: GameLoadingStartedEvent
    [AppEventTypes.GameLoadingPhaseChanged]: GameLoadingPhaseChangedEvent
    [AppEventTypes.GameLoadingProgress]: GameLoadingProgressEvent
    [AppEventTypes.StartupComplete]: BaseInteractionEvent

    // TODO: Add LightingEventMap entries here when LightingEvents.ts gets a map
    // TODO: Add StorePropsEventMap entries here when StoreProps events get a map
}

export type InteractionEventName = keyof InteractionEventMap
export type InteractionEventDetail<T extends InteractionEventName> = InteractionEventMap[T]

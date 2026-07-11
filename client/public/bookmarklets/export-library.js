/**
 * Steam Library Export Bookmarklet
 *
 * Install: drag this file's contents (wrapped as `javascript:...`) to the bookmarks bar,
 * or paste into the address bar on a bookmark's URL field. See docs/plans/bookmarklet-capture-spike.md.
 *
 * Usage: click "Import from Steam" in Steam Brick and Mortar — it opens your Steam games
 * page for you. Click this bookmarklet there. It delivers the captured library straight
 * back to the app (no file needed) when possible, and falls back to a downloaded
 * steam-library.json otherwise.
 *
 * Delivery, in priority order:
 *   1. window.opener — if the app opened this tab, postMessage straight back to it.
 *      No readiness handshake needed: that tab has been alive (and listening) since
 *      before this tab even opened, so there's no race to guard against.
 *   2. Active open — if the app didn't open this tab (bookmarklet clicked while
 *      organically browsing Steam) but the app's origin is known (embedded in the URL
 *      hash by the app's own "Import from Steam" button), open/focus a tab to the app
 *      and hand off once it signals it's ready to receive.
 *   3. File download — no opener, no known app origin. Standalone fallback; the app's
 *      file picker imports this later.
 *
 * Verified live 2026-07-02 against steamcommunity.com's current profile UI. Steam has moved
 * off the old `rgGames` global and the `?xml=1` feed (both confirmed dead). The current UI is
 * server-rendered React with client-side hydration via React Query; the full owned-games list
 * ships embedded in a <script> tag as an escaped JSON blob, keyed by a query named
 * "OwnedGames". This script mines that blob. Full structure reference:
 * docs/research/steam-profile-ssr-hydration-research.md. It is inherently coupled to Valve's
 * current page implementation and WILL break if they change it — that's the tradeoff for not
 * needing a Steam Web API key or our Lambda.
 */
(function exportSteamLibrary() {
    'use strict';

    var MESSAGE_TYPE = 'sbam-library-export';
    var READY_MESSAGE_TYPE = 'sbam-ready';
    var APP_WINDOW_NAME = 'sbam-app';
    var STEAM_EXPORT_WINDOW_NAME = 'sbam-steam-export';
    var READY_TIMEOUT_MS = 8000;

    /**
     * Only a real, human-chosen vanity URL (/id/<name>/) makes a good display name — a bare
     * numeric /profiles/<steamid>/ (the default when no vanity is set) is not one.
     */
    function readDisplayNameFromUrl() {
        var match = /^\/id\/([^/]+)/.exec(location.pathname);
        return match ? decodeURIComponent(match[1]) : null;
    }

    /** A numeric /profiles/<steamid>/ URL carries the steamid64 directly — unlike the vanity
     *  case, no lookup is needed. */
    function readSteamIdFromProfileUrl() {
        var match = /^\/profiles\/(\d+)/.exec(location.pathname);
        return match ? match[1] : null;
    }

    /**
     * On a vanity URL (/id/<name>/) the steamid isn't in the URL, but it rides along in the
     * same hydration blob as OwnedGames: React Query keys every query by a tuple, and the
     * PlayerLinkDetails query's own queryKey is `["PlayerLinkDetails", "<steamid64>"]` — the
     * account's own (public, non-secret) numeric id, repeated in queryHash right after it.
     * Deliberately reads only that tuple value, never the query's `data` (which carries
     * account_name and other sensitive fields this must not touch). Verified live 2026-07-11
     * against a real vanity-URL profile — see docs/research/steam-profile-ssr-hydration-research.md
     * section 4 (note: that doc's PlayerLinkDetails field table describes `data`, not the
     * queryKey this reads from). Best-effort: returns null on any structural mismatch rather
     * than throwing, since this is enrichment, not the primary extraction the rest of the
     * script depends on.
     */
    function extractSteamIdFromPlayerLinkDetails(scriptText) {
        var match = /PlayerLinkDetails\\*"\s*,\s*\\*"(\d{10,20})\\*"/.exec(scriptText);
        return match ? match[1] : null;
    }

    function findOwnedGamesScript() {
        var scripts = document.scripts;
        for (var i = 0; i < scripts.length; i++) {
            if (scripts[i].textContent && scripts[i].textContent.indexOf('OwnedGames') !== -1) {
                return scripts[i].textContent;
            }
        }
        return null;
    }

    /**
     * The OwnedGames query's data array is embedded as a JSON string escaped at an
     * unpredictable nesting depth (observed 1x-3x backslash-quote pairs depending on where in
     * the SSR payload it landed). Structural characters ([, ], {, }, comma, colon) are never
     * escaped by JSON.stringify, so bracket/marker scanning on the raw text is reliable even
     * though the escape depth isn't fixed.
     */
    function extractOwnedGames(scriptText) {
        var anchor = scriptText.indexOf('OwnedGames');
        if (anchor === -1) {
            throw new Error('Could not find the OwnedGames data block on this page.');
        }

        var before = scriptText.slice(0, anchor);
        var stateRe = /state\\*":\{\\*"data\\*":\[/g;
        var match;
        var startMatch = null;
        while ((match = stateRe.exec(before)) !== null) {
            startMatch = match;
        }
        if (!startMatch) {
            throw new Error('Could not locate the start of the owned-games array.');
        }
        var arrayStart = startMatch.index + startMatch[0].lastIndexOf('[');

        var afterStart = scriptText.slice(arrayStart);
        var endMarkerIdx = afterStart.indexOf('dataUpdateCount');
        if (endMarkerIdx === -1) {
            throw new Error('Could not locate the end of the owned-games array.');
        }
        var beforeEndMarker = afterStart.slice(0, endMarkerIdx);
        var lastBracket = beforeEndMarker.lastIndexOf(']');
        if (lastBracket === -1) {
            throw new Error('Could not locate the closing bracket of the owned-games array.');
        }

        var raw = afterStart.slice(0, lastBracket + 1);
        for (var i = 0; i < 6 && raw.indexOf('\\"') !== -1; i++) {
            raw = raw.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }

        return JSON.parse(raw);
    }

    function buildExportPayload(games, scriptText) {
        return {
            schema: 'sbam-library-export/v1',
            exported_at: new Date().toISOString(),
            display_name: readDisplayNameFromUrl(),
            steam_id: readSteamIdFromProfileUrl() || extractSteamIdFromPlayerLinkDetails(scriptText),
            game_count: games.length,
            games: games.map(function (g) {
                return {
                    appid: g.appid,
                    name: g.name,
                    playtime_forever: g.playtime_forever || 0,
                    rtime_last_played: g.rtime_last_played || undefined,
                    playtime_disconnected: g.playtime_disconnected || undefined,
                    capsule_filename: g.capsule_filename || undefined,
                    has_dlc: g.has_dlc,
                    has_workshop: g.has_workshop,
                    has_market: g.has_market,
                    has_community_visible_stats: g.has_community_visible_stats,
                    has_leaderboards: g.has_leaderboards,
                    content_descriptorids: g.content_descriptorids,
                    img_icon_url: g.img_icon_url || undefined
                };
            })
        };
    }

    function downloadJson(payload) {
        var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'steam-library.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    /**
     * Small fixed-position status overlay on the Steam page itself. We deliberately never
     * auto-close this tab (see the app side) — the overlay ends in a state that tells the
     * user it's safe to close it themselves, rather than the tab vanishing out from under them.
     */
    var OVERLAY_ID = 'sbam-export-status-overlay';
    function showStatusOverlay(message, kind) {
        var existing = document.getElementById(OVERLAY_ID);
        if (existing) existing.remove();

        var colors = { loading: '#0d47a1', success: '#1b5e20', error: '#b71c1c' };
        var overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.textContent = message;
        overlay.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2147483647;' +
            'background:' + (colors[kind] || colors.loading) + ';color:#fff;' +
            'padding:14px 18px;border-radius:8px;font:14px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;' +
            'box-shadow:0 4px 16px rgba(0,0,0,0.4);max-width:280px;';
        document.body.appendChild(overlay);
    }

    /** The app's own button tags the URL it opens with its origin: #sbam-origin=<encoded>. */
    function readTargetOriginFromHash() {
        var match = /[#&]sbam-origin=([^&]+)/.exec(location.hash);
        if (!match) return null;
        try {
            return decodeURIComponent(match[1]);
        } catch (e) {
            return null;
        }
    }

    /**
     * Fast path: the app opened this tab, so window.opener has been alive (and its message
     * listener registered) the whole time. No readiness handshake needed — fire and forget.
     * If the app's tab was closed in the meantime, this silently does nothing (known v1
     * limitation — no retry/fallback here; see docs/plans/bookmarklet-capture-spike.md).
     */
    function deliverViaOpener(payload, targetOrigin) {
        window.opener.postMessage({ type: MESSAGE_TYPE, payload: payload }, targetOrigin || '*');
        showStatusOverlay('Done! You can now close this tab.', 'success');
        // window.opener is set, so this tab is script-closable — browsers allow a window to
        // close itself (or be closed by its opener) with no confirmation prompt in that case.
        // If it's silently refused for some other reason, the overlay above is the fallback.
        setTimeout(function () { window.close(); }, 400);
    }

    /**
     * No opener, but we know the app's origin (from the hash). Open/focus a tab to the app
     * and wait for it to announce readiness before sending — a fresh tab's listener may not
     * be attached yet the instant window.open() returns, and postMessage does not queue
     * messages sent before a listener exists.
     */
    function deliverViaActiveOpen(payload, targetOrigin) {
        var target = window.open(targetOrigin, APP_WINDOW_NAME);
        if (!target) {
            downloadJson(payload);
            showStatusOverlay('Downloaded steam-library.json — import it with "Import from file" in the app. You can now close this tab.', 'success');
            return;
        }

        var delivered = false;
        var timeoutHandle = setTimeout(function () {
            if (delivered) return;
            window.removeEventListener('message', onReady);
            downloadJson(payload);
            showStatusOverlay('Downloaded steam-library.json — import it with "Import from file" in the app. You can now close this tab.', 'success');
        }, READY_TIMEOUT_MS);

        function onReady(event) {
            if (event.source !== target) return;
            if (event.origin !== targetOrigin) return;
            if (!event.data || event.data.type !== READY_MESSAGE_TYPE) return;

            delivered = true;
            clearTimeout(timeoutHandle);
            window.removeEventListener('message', onReady);
            target.postMessage({ type: MESSAGE_TYPE, payload: payload }, targetOrigin);
            showStatusOverlay('Done! You can now close this tab.', 'success');
            // This tab had no window.opener to begin with (that's why we're in this branch),
            // so self-close is likely to be silently refused — attempt it anyway, the overlay
            // above is the fallback either way.
            setTimeout(function () { window.close(); }, 400);
        }

        window.addEventListener('message', onReady);
    }

    try {
        if (location.hostname !== 'steamcommunity.com') {
            // Not on Steam yet — this is the same one bookmarklet doing double duty. Open the
            // tagged games page exactly like the app's own "Import from Steam" button does, so
            // clicking it a second time there completes the export. One artifact, two clicks
            // when needed, matches whatever page you happened to click it from.
            var steamUrl = 'https://steamcommunity.com/my/games/?tab=all#sbam-origin=' + encodeURIComponent(location.origin);
            window.open(steamUrl, STEAM_EXPORT_WINDOW_NAME);
            return;
        }

        showStatusOverlay('Gathering game data for Brick and Mortar…', 'loading');

        var scriptText = findOwnedGamesScript();
        if (!scriptText) {
            document.getElementById(OVERLAY_ID).remove();
            alert('Steam Library Export: could not find your game list on this page.\n\n' +
                'Make sure you are on your own Steam profile\'s "Games" page ' +
                '(steamcommunity.com/id/<you>/games?tab=all), fully loaded, then try again.');
            return;
        }

        var games = extractOwnedGames(scriptText);
        if (!games.length) {
            document.getElementById(OVERLAY_ID).remove();
            alert('Steam Library Export: found the game list, but it was empty.');
            return;
        }

        var payload = buildExportPayload(games, scriptText);
        var targetOrigin = readTargetOriginFromHash();

        if (window.opener && !window.opener.closed) {
            deliverViaOpener(payload, targetOrigin);
        } else if (targetOrigin) {
            deliverViaActiveOpen(payload, targetOrigin);
        } else {
            downloadJson(payload);
            showStatusOverlay('Downloaded steam-library.json — import it with "Import from file" in the app. You can now close this tab.', 'success');
        }
    } catch (err) {
        var overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.remove();
        alert('Steam Library Export failed: ' + (err && err.message ? err.message : err) +
            '\n\nSteam may have changed their page again. This bookmarklet needs an update.');
    }
})();

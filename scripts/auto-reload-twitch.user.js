// ==UserScript==
// @name            Auto Reload High Latency
// @namespace       http://tampermonkey.net/
// @version         1.0.0
// @description     Used to automatic reload twitch stream if the latency pass a certain threshold
// @author          MrChuw
// @match           https://www.twitch.tv/*
// @match           https://player.twitch.tv/*
// @grant           none
// @updateURL       https://github.com/MrChuw/UserScripts/raw/main/scripts/auto-reload-twitch.user.js
// @downloadURL     https://github.com/MrChuw/UserScripts/raw/main/scripts/auto-reload-twitch.user.js
// @tag             twitch
// @tag             player
// ==/UserScript==

const MAX_LATENCY = 60.0;
const COOLDOWN_MS = 5000;
const ENABLE_LOG = False;


// 1. Open menu
document.querySelector('[data-a-target="player-settings-button"]')?.click();

// 2. Opem submenu "advanced"
setTimeout(() => {
    document.querySelector('[data-a-target="player-settings-menu-item-advanced"]')?.click();
}, 200);

// 3. Enable statistics toggle.
setTimeout(() => {
    // Activate the statistics
    const toggle = document.querySelector('[data-a-target="player-settings-submenu-advanced-video-stats"]');
    const checkbox = toggle?.querySelector('input[data-a-target="tw-toggle"]');
    checkbox?.click();

    // Hides the statistics
    setTimeout(() => {
        const stats = document.querySelector('[data-a-target="player-overlay-video-stats"]');
        if (stats) {
            stats.style.opacity = "0";
            stats.style.pointerEvents = "none";
        }
    }, 200);
}, 400);

// 4. Waits for statistics to load.
setTimeout(() => {}, 500);

function readStatByIndex(index) {
    const rows = document.querySelectorAll('[data-a-target="player-overlay-video-stats-row"] p[role="status"]');
    if (!rows.length) return null;
    return rows[index]?.innerText?.trim() ?? null;
}

let lastReload = 0;
function readDownloadResolution()     { return readStatByIndex(0); }
function readRenderResolution()       { return readStatByIndex(1); }
function readViewportResolution()     { return readStatByIndex(2); }

function readBitrate()                { return readStatByIndex(3); }
function readEstimatedBandwidth()     { return readStatByIndex(4); }
function readDroppedFrames()          { return readStatByIndex(5); }
function readBufferSize()             { return readStatByIndex(6); }

function readStreamerLatency()        { return readStatByIndex(7); }

function readCodecs()                 { return readStatByIndex(8); }
function readProtocol()               { return readStatByIndex(9); }
function readLatencyMode()            { return readStatByIndex(10); }
function readRenderArea()             { return readStatByIndex(11); }

function readBackendVersion()         { return readStatByIndex(12); }
function readPlaybackSessionID()      { return readStatByIndex(13); }
function readAdID()                   { return readStatByIndex(14); }

function log(...args) {
        if (ENABLE_LOG) {
            console.log('[Reload High Latency]', ...args);
        }
    }

function readLatency() {
    const statValues = document.querySelectorAll(
        'tr[data-a-target="player-overlay-video-stats-row"] td:nth-child(2) p[aria-roledescription="video player stat"]'
    );

    for (const el of statValues) {
        const text = el.textContent.trim();

        if (/^[\d.]+\s*s$/i.test(text)) {
            return parseFloat(text.replace("s", "").trim());
        }
    }
    return null;
}

function reloadPlayer() {
    const video = document.querySelector("video");

    if (!video) return;

    try {
        video.pause();

        setTimeout(() => {
            video.play();
        }, 300);
    } catch (e) {
        console.error("Erro ao reiniciar player:", e);
    }
}


setInterval(() => {
    const latency = readLatency();

    if (latency != null) {
        log("Latency:", latency, "s");

        const now = Date.now();

        if (latency >= MAX_LATENCY && (now - lastReload) >= COOLDOWN_MS) {
            console.warn("High latency! Restarting player...");
            lastReload = now;
            reloadPlayer();
        }
    }
}, 1000);






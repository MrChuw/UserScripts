// ==UserScript==
// @name         Quick Playlist add
// @namespace    http://tampermonkey.net/
// @version      0.4.0
// @description  Use the P button to add the current song to a playlist
// @author       MrChuw
// @author       MagnusRE (modified)
// @match        *://music.youtube.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=http://music.youtube.com
// @updateURL    https://raw.githubusercontent.com/MrChuw/UserScripts/raw/main/scripts/youtube-music-quick-add.user.js
// @downloadURL  https://raw.githubusercontent.com/MrChuw/UserScripts/raw/main/scripts/youtube-music-quick-add.user.js
// @license      MIT
// ==/UserScript==

// Original by: https://greasyfork.org/en/scripts/544566-add-to-playlist-shortcut-for-youtube-music

// --- CONFIGURATION ---
const ENABLE_LOGS = true;
const TARGET_TEXTS = [
    "Save to playlist",
    "Salvar na playlist",
    "Guardar en lista de reproducción",
    "Enregistrer dans la playlist",
];
const AUTO_SELECT_PLAYLIST = true;
const AUTO_PLAYLIST_NAMES = ["TUDO", "Músicas que gostei"];
// ---------------------

let isProcessing = false;
let lastKeyPressTime = 0;
const DEBOUNCE_TIME = 500; // ms

function customLog(message, type = "log") {
    if (ENABLE_LOGS) {
        const formatted = `[Quick Playlist] ${message}`;
        if (type === "warn") console.warn(formatted);
        else if (type === "error") console.error(formatted);
        else console.log(formatted);
    }
}

function isElementVisible(el) {
    return el && (el.offsetWidth > 0 || el.offsetHeight > 0);
}

function closePlaylistModal() {
    const modal = document.querySelector("ytmusic-add-to-playlist-renderer");
    if (!isElementVisible(modal)) return false;

    customLog("Playlist modal detected (visible) – closing with Escape.");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, which: 27 }));
    return true;
}

function closePopupMenu() {
    const menuButton = document.querySelector(
        "ytmusic-player-bar div.middle-controls ytmusic-menu-renderer#button-shape button, " +
            ".middle-controls #button-shape button",
    );
    if (!menuButton) return false;

    const popup = document.querySelector("ytmusic-menu-popup-renderer");
    if (isElementVisible(popup)) {
        customLog("Popup menu open (visible) – closing.");
        menuButton.click();
        return true;
    }
    return false;
}

async function waitForAddToPlaylist(timeout = 2000) {
    const start = Date.now();
    let el = null;
    while (Date.now() - start < timeout) {
        const textElements = document.querySelectorAll(
            "ytmusic-menu-navigation-item-renderer yt-formatted-string.text",
        );
        for (const textEl of textElements) {
            const text = textEl.textContent.trim();
            if (TARGET_TEXTS.includes(text) && isElementVisible(textEl)) {
                el = textEl.closest("a");
                if (el) {
                    customLog(`"Save to playlist" item found: "${text}"`);
                    break;
                }
            }
        }
        if (el) break;
        await new Promise((r) => setTimeout(r, 50));
    }
    if (!el) customLog('Timeout: "Save to playlist" item not found.', "warn");
    return el;
}

async function waitForPlaylistModalAndClick(timeout = 3000) {
    const start = Date.now();
    customLog(`Waiting for modal and searching for: ${AUTO_PLAYLIST_NAMES.join(" -> ")}`);
    while (Date.now() - start < timeout) {
        const options = document.querySelectorAll(
            "ytmusic-add-to-playlist-renderer ytmusic-playlist-add-to-option-renderer",
        );
        if (options.length > 0) {
            for (const targetName of AUTO_PLAYLIST_NAMES) {
                for (const option of options) {
                    const titleEl = option.querySelector("#title");
                    if (titleEl && titleEl.textContent.trim() === targetName && isElementVisible(option)) {
                        const actionBtn = option.querySelector("button");
                        if (actionBtn) {
                            customLog(`Playlist "${targetName}" found – clicking.`);
                            actionBtn.click();
                            await new Promise((r) => setTimeout(r, 100));
                            return true;
                        }
                    }
                }
            }
        }
        await new Promise((r) => setTimeout(r, 50));
    }
    customLog("Timeout: target playlist not found in modal.", "warn");
    return false;
}

(function () {
    "use strict";

    window.addEventListener(
        "keydown",
        function (event) {
            // Ignore if it's not the P key or if inside a text field
            if (event.Code !== 80) return;
            const tag = document.activeElement.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA") return;

            // Debounce: if the key was pressed recently, ignore
            const now = Date.now();
            if (now - lastKeyPressTime < DEBOUNCE_TIME) {
                customLog("P key ignored (debounce).");
                return;
            }
            lastKeyPressTime = now;

            // Prevents simultaneous execution
            if (isProcessing) {
                customLog("P key ignored – processing in progress.");
                return;
            }

            // Prevents additional events
            event.preventDefault();
            event.stopPropagation();

            customLog("P key pressed – starting flow.");
            isProcessing = true;

            // Close pending UI elements (now only if they are actually visible on screen)
            closePopupMenu();
            closePlaylistModal();

            setTimeout(async () => {
                try {
                    const popupMenu = document.querySelector(
                        "ytmusic-player-bar div.middle-controls ytmusic-menu-renderer#button-shape button, " +
                            ".middle-controls #button-shape button",
                    );
                    if (!popupMenu) {
                        customLog("Menu button not found.", "error");
                        return;
                    }
                    customLog("Opening menu...");
                    popupMenu.click();

                    const playlistLink = await waitForAddToPlaylist();
                    if (playlistLink) {
                        customLog('Clicking "Save to playlist".');
                        playlistLink.click();
                        if (AUTO_SELECT_PLAYLIST) {
                            await waitForPlaylistModalAndClick();
                        }
                    }
                } catch (err) {
                    customLog("Error: " + err.message, "error");
                } finally {
                    // Release the flag after a slightly longer time to prevent re-entry
                    setTimeout(() => {
                        isProcessing = false;
                        customLog("Flow finished, ready for next execution.");
                    }, 500);
                }
            }, 150);
        },
        false,
    );
})();

// ==UserScript==
// @name            Better Twitch Player
// @namespace       http://tampermonkey.net/
// @version         3.1.1
// @description     Volume scroll, Middle Click to Mute, Auto Theatre Mode, Remove Bits and TopBar, Prevent Pause on unfocus, Force Quality "Source".
// @author          MrChuw
// @match           https://www.twitch.tv/*
// @match           https://player.twitch.tv/*
// @grant           none
// @updateURL       https://github.com/MrChuw/UserScripts/raw/main/scripts/better-twitch-player.user.js
// @downloadURL     https://github.com/MrChuw/UserScripts/raw/main/scripts/better-twitch-player.user.js
// @tag             twitch
// @tag             player
// ==/UserScript==

// Uses code from: https://greasyfork.org/en/scripts/383093-twitch-disable-automatic-video-downscale


(function () {
    'use strict';

    // ======================== CONFIG ========================
    const ENABLE_LOG = false;
    const VOLUME_STEP = 0.01;
    const INITIAL_DELAY_MS = 5000;
    const doOnlySetting = false;
    // ========================================================

    let video = null;
    let slider = null;
    let lastVolumeBeforeMute = 0.5;

    function log(...args) {
        if (ENABLE_LOG) {
            console.log('[Twitch Script]', ...args);
        }
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function showVolumeOverlay(volume) {
        let overlay = document.getElementById('volume-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'volume-overlay';
            overlay.style.position = 'fixed';
            overlay.style.top = '50%';
            overlay.style.left = '50%';
            overlay.style.transform = 'translate(-50%, -50%)';
            overlay.style.zIndex = '9999';
            overlay.style.padding = '20px 40px';
            overlay.style.background = 'rgba(0,0,0,0.7)';
            overlay.style.color = '#fff';
            overlay.style.fontSize = '24px';
            overlay.style.borderRadius = '10px';
            overlay.style.pointerEvents = 'none';
            overlay.style.transition = 'opacity 0.3s';
            overlay.style.opacity = '1';
            document.body.appendChild(overlay);
        }

        overlay.textContent = `${Math.round(volume * 100)}%`;
        overlay.style.opacity = '1';

        clearTimeout(overlay._hideTimeout);
        overlay._hideTimeout = setTimeout(() => {
            overlay.style.opacity = '0';
        }, 1000);
    }

    function isOnTwitchPlayer() {
        return location.hostname === 'player.twitch.tv';
    }

    function isOnTwitchChannelPage() {
        return /^https:\/\/www\.twitch\.tv\/[^\/]+$/.test(location.href);
    }

    function isOnChannelPage() {
        return isOnTwitchPlayer() || isOnTwitchChannelPage();
    }


    function overrideVisibilityAndAutoPlay(doOnlySetting) {
        log('⚠️overrideVisibilityAndAutoPlay');
        if (doOnlySetting === false) {
            try {
                Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: false });
                Object.defineProperty(document, 'webkitVisibilityState', { value: 'visible', writable: false });
                document.hasFocus = () => true;
            } catch (e) {
                log('⚠️ Failed to override visibility properties:', e);
            }

            const initialHidden = document.hidden;
            let didInitialPlay = false;
            let lastVideoPlaying = false;

            document.addEventListener('visibilitychange', function (e) {
                if (document.hidden === false && initialHidden === true && didInitialPlay === false) {
                    log('⚠️ document.hidden === false && initialHidden === true && didInitialPlay === false');
                } else {
                    log('⚠️ e.stopImmediatePropagation()');
                    e.stopImmediatePropagation();
                }
                if (document.hidden) {
                    log('⚠️ document.hidden');
                    didInitialPlay = true;
                    const videos = document.getElementsByTagName('video');
                    if (videos.length > 0) {
                        lastVideoPlaying = !videos[0].paused && !videos[0].ended;
                    } else {
                        lastVideoPlaying = false;
                    }
                } else {
                    playVideo();
                }
            }, true);

            function playVideo() {
                const videos = document.getElementsByTagName('video');
                if (videos.length > 0 && ((didInitialPlay === false || lastVideoPlaying === true) && !videos[0].ended)) {
                    videos[0].play();
                    didInitialPlay = true;
                }
            }
        }
    }

    function setQualitySettings() {
        try {
            window.localStorage.setItem('s-qs-ts', Math.floor(Date.now()));
            window.localStorage.setItem('video-quality', '{"default":"chunked"}');
            log('⚙️ Quality set to Source via localStorage');
        } catch (e) {
            console.log(e);
        }
    }

    async function waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Timeout waiting for element: ${selector}`));
            }, timeout);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    clearTimeout(timer);
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            const el = document.querySelector(selector);
            if (el) {
                clearTimeout(timer);
                observer.disconnect();
                resolve(el);
            }
        });
    }

    async function enableTheatreMode() {
        try {
            const theatreButton = await waitForElement('button[aria-label="Theatre Mode (alt+t)"]');
            theatreButton.click();
            log('🎭 Theatre mode enabled');
        } catch (e) {
            log('⚠️ Failed to enable theatre mode:', e);
        }
    }

    function observeAndAlwaysRemove(selector, options = { removeParent: false, logLabel: selector, removeLastChildOf: false }) {
        const removeAll = () => {
            if (options.removeLastChildOf) {
                const parent = document.querySelector(selector);
                if (parent && parent.lastElementChild) {
                    parent.removeChild(parent.lastElementChild);
                    log(`🗑️ Removed last child of ${options.logLabel}`);
                }
            } else {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => {
                    const target = options.removeParent ? el.parentElement : el;
                    if (target) {
                        target.remove();
                        log(`🗑️ Removed ${options.logLabel}`);
                    }
                });
            }
        };

        const observer = new MutationObserver(removeAll);
        observer.observe(document.body, { childList: true, subtree: true });

        removeAll();
    }

    function removeTargetElements() {
        observeAndAlwaysRemove('div#one-tap-store-id', {
            removeParent: true,
            logLabel: 'One-tap store'
        });

        observeAndAlwaysRemove('.top-bar', {
            removeParent: false,
            logLabel: 'Top bar'
        });

        if (isOnTwitchPlayer()) {
            observeAndAlwaysRemove('button[aria-label="Watch on Twitch"]', {
                removeParent: false,
                logLabel: 'Twitch right control last button'
            });
        };
    }


    function findPlayerElements() {
        video = document.querySelector('video');
        slider = document.querySelector('input[data-a-target="player-volume-slider"]');

        if (video && slider) {
            log('🎥 Player elements found');
            attachListeners();
        }
    }

    function updateVolume(newVolume) {
        if (!video || !slider) {
            return;
        }

        newVolume = Math.max(0, Math.min(1, newVolume));

        video.volume = newVolume;
        slider.value = newVolume;
        slider.setAttribute('aria-valuenow', Math.round(newVolume * 100));
        slider.setAttribute('aria-valuetext', Math.round(newVolume * 100) + '%');

        const fill = slider.parentElement.querySelector('[data-test-selector="tw-range__fill-value-selector"]');
        if (fill) {
            fill.style.width = `${newVolume * 100}%`;
        }

        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));

        showVolumeOverlay(newVolume); // 👈 aqui

        log(`🔊 Volume set to ${Math.round(newVolume * 100)}%`);
    }

    function toggleMute() {
        if (!video) {
            return;
        }

        if (video.volume > 0) {
            lastVolumeBeforeMute = video.volume;
            updateVolume(0);
            log('🔇 Muted');
        } else {
            const restoredVolume = lastVolumeBeforeMute > 0 ? lastVolumeBeforeMute : 0.5;
            updateVolume(restoredVolume);
            log(`🔊 Unmuted to ${Math.round(restoredVolume * 100)}%`);
        }
    }

    function attachListeners() {
        window.onwheel = (event) => {
            if (!video) {
                return;
            }
            event.preventDefault();

            const currentVolume = video.volume;
            const newVolume = event.deltaY < 0
            ? currentVolume + VOLUME_STEP
            : currentVolume - VOLUME_STEP;

            updateVolume(newVolume);
        };

        window.onmousedown = (event) => {
            if (event.button === 1) {
                if (!video) {
                    return;
                }
                event.preventDefault();
                toggleMute();
            }
        };

        log('✅ Volume and mute listeners attached');
    }

    async function forceSourceQualityByClick() {
        if (isOnTwitchPlayer()) {
            return;
        }
        log('🎯 Trying to force quality Source via UI');

        try {
            const settingsBtn = await waitForElement('button[data-a-target="player-settings-button"]', 2000);
            settingsBtn.click();
            await sleep(500);

            const qualityBtn = Array.from(document.querySelectorAll('button[role="menuitem"]'))
            .find(el => el.textContent.includes('Quality'));
            qualityBtn?.click();
            await sleep(500);

            const sourceOption = Array.from(document.querySelectorAll('div[role="menuitemradio"]'))
            .find(el => el.textContent.includes('Source'));
            sourceOption?.click();
            await sleep(500);
            settingsBtn.click();

            log('✅ Quality set to Source via UI');
        } catch (err) {
            log('⚠️ Failed to force Source quality via UI:', err);
        }
    }

    async function initializeScript() {
        if (!isOnChannelPage()) {
            log('⛔ Not on a channel page. Exiting script.');
            return;
        }

        log(`⏳ Waiting ${INITIAL_DELAY_MS / 1000}s to start...`);
        setTimeout(async () => {
            if (!isOnTwitchPlayer()) {
                await enableTheatreMode();
            }
            removeTargetElements();

            findPlayerElements();

            const observer = new MutationObserver(findPlayerElements);
            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                overrideVisibilityAndAutoPlay(doOnlySetting);
                setQualitySettings();
                window.addEventListener('popstate', setQualitySettings);

                if (isOnTwitchPlayer()) {
                    forceSourceQualityByClick();
                }
            }, 1000);

        }, INITIAL_DELAY_MS);
    }

    initializeScript();
})();

// ==UserScript==
// @name         YouTube & Music Share Link Cleaner
// @namespace    http://tampermonkey.net/
// @match        https://www.youtube.com/*
// @match        https://music.youtube.com/*
// @match        https://youtu.be/*
// @description  Remove tracking query parameters from YouTube and YouTube Music share links
// @grant        none
// @version      2.2
// @author       MrChuw
// @author       DRagon Vase
// @run-at       window-load
// @updateURL    https://github.com/MrChuw/UserScripts/raw/main/scripts/youtube-share-cleaner.user.js
// @downloadURL  https://github.com/MrChuw/UserScripts/raw/main/scripts/youtube-share-cleaner.user.js
// @license      MIT
// ==/UserScript==

// Original: https://greasyfork.org/en/scripts/490789-youtube-share-link-cleaner

(function () {
    "use strict";

    function cleanUrlString(urlStr) {
        if (!urlStr || typeof urlStr !== "string") return urlStr;
        try {
            const url = new URL(urlStr);
            if (url.searchParams.has("si")) {
                url.searchParams.delete("si");
                return url.toString();
            }
        } catch (e) {}
        return urlStr;
    }

    const originalWriteText = navigator.clipboard.writeText;
    navigator.clipboard.writeText = function (text) {
        const cleanedText = cleanUrlString(text);
        return originalWriteText.call(this, cleanedText);
    };

    function processInputField(input) {
        if (!input || !input.value) return;
        if (input.value.includes("si=")) {
            const clean = cleanUrlString(input.value);
            if (input.value !== clean) {
                input.value = clean;
            }
        }
    }

    const inputDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");

    if (inputDescriptor && inputDescriptor.set) {
        const originalSet = inputDescriptor.set;
        Object.defineProperty(HTMLInputElement.prototype, "value", {
            set: function (val) {
                if (this.id === "share-url" && typeof val === "string" && val.includes("si=")) {
                    val = cleanUrlString(val);
                }
                return originalSet.call(this, val);
            },
            get: function () {
                return inputDescriptor.get.call(this);
            },
        });
    }

    const observer = new MutationObserver(() => {
        const inputField = document.querySelector("#share-url");
        if (inputField) {
            processInputField(inputField);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
})();

// ==UserScript==
// @name         Auto VTT Downloader
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  Automatically downloads VTT files loaded on the page, avoiding duplicates. Supports dynamic domain list from URL.
// @author       MrChuw
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_download
// @updateURL    https://github.com/MrChuw/UserScripts/raw/main/auto-vtt-downloader.user.js
// @downloadURL  https://github.com/MrChuw/UserScripts/raw/main/auto-vtt-downloader.user.js
// ==/UserScript==

(function() {
    'use strict';

    const ENABLE_LOG = true;

    // Can be a static array OR a string URL to a raw list (e.g., Pastebin Raw, Gist Raw)
    const allowedDomainsSource = "https://example.org//raw/your-paste-id"; // Or: ["https://example.com/"]

    const downloadedFiles = new Set();
    let allowedDomains = [];

    function log(...args) {
        if (ENABLE_LOG) console.log('[VTT Downloader]', ...args);
    }

    function isAllowedUrl(url) {
        return allowedDomains.some(domain => url.startsWith(domain));
    }

    function isVttFile(url) {
        return url.toLowerCase().endsWith('.vtt');
    }

    function getFileName(url) {
        return url.split('/').pop();
    }

    function downloadFile(url) {
        if (!isAllowedUrl(url)) {
            log('URL not allowed:', url);
            return;
        }
        if (!isVttFile(url)) {
            log('Not a VTT file:', url);
            return;
        }

        const fileName = getFileName(url);
        console.log('Downloading VTT file:', fileName);
        try {
            GM_download({
                url: url,
                name: fileName,
                onerror: function(err) {
                    log('Error with GM_download, attempting fallback:', err);
                    fallbackDownload(url);
                }
            });
        } catch (e) {
            log('Error calling GM_download:', e);
            fallbackDownload(url);
        }
    }

    function fallbackDownload(url) {
        GM_xmlhttpRequest({
            method: 'GET',
            url: url,
            responseType: 'blob',
            onload: function(response) {
                if (response.status === 200) {
                    const blob = new Blob([response.response], { type: 'text/vtt' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = getFileName(url);
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                } else {
                    log('Failed to download using GM_xmlhttpRequest:', response);
                }
            }
        });
    }

    function interceptFetch() {
        const originalFetch = window.fetch;
        window.fetch = async function(resource, options) {
            if (typeof resource === 'string' && isVttFile(resource) && isAllowedUrl(resource)) {
                const fileName = getFileName(resource);
                if (!downloadedFiles.has(resource)) {
                    downloadedFiles.add(resource);
                    log('Intercepting fetch to download VTT:', fileName);
                    downloadFile(resource);
                } else {
                    console.log('VTT file already downloaded:', fileName);
                }
            }
            return originalFetch.apply(this, arguments);
        };
    }

    function interceptXHR() {
        const originalOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
            const originalUrl = typeof url === 'string' ? url : this.url;
            if (typeof originalUrl === 'string' && isVttFile(originalUrl) && isAllowedUrl(originalUrl)) {
                const fileName = getFileName(originalUrl);
                if (!downloadedFiles.has(originalUrl)) {
                    downloadedFiles.add(originalUrl);
                    log('Intercepting XHR to download VTT:', fileName);
                    downloadFile(originalUrl);
                } else {
                    console.log('VTT file already downloaded:', fileName);
                }
            }
            return originalOpen.apply(this, arguments);
        };
    }

    function loadAllowedDomains(callback) {
        if (Array.isArray(allowedDomainsSource)) {
            allowedDomains = allowedDomainsSource;
            callback();
        } else if (typeof allowedDomainsSource === 'string') {
            log('Fetching allowed domains from remote source...');
            GM_xmlhttpRequest({
                method: 'GET',
                url: allowedDomainsSource,
                onload: function(response) {
                    if (response.status === 200) {
                        allowedDomains = response.responseText
                            .split('\n')
                            .map(line => line.trim())
                            .filter(line => line.length && !line.startsWith('#'));
                        log('Loaded allowed domains:', allowedDomains);
                        callback();
                    } else {
                        log('Failed to load allowed domains. Status:', response.status);
                    }
                },
                onerror: function(err) {
                    log('Error fetching allowed domains:', err);
                }
            });
        } else {
            log('Invalid allowedDomainsSource. Must be array or URL string.');
        }
    }

    loadAllowedDomains(() => {
        interceptFetch();
        interceptXHR();
    });
})();

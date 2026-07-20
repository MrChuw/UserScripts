// ==UserScript==
// @name         Screen Capture
// @namespace    http://tampermonkey.net/
// @version      0.1.1
// @description  Professional screenshot options using Snapdom with robust clipboard fallback
// @author       You
// @match        *://*/*
// @run-at       document-end
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_notification
// @require      https://cdn.jsdelivr.net/npm/@zumer/snapdom@2.16.0/dist/snapdom.min.js
// @updateURL    https://github.com/MrChuw/UserScripts/raw/main/scripts/screenshot.user.js
// @downloadURL  https://github.com/MrChuw/UserScripts/raw/main/scripts/screenshot.user.js
// ==/UserScript==

(function () {
    "use strict";

    const CONFIG = {
        defaultScale: 2,
        defaultFormat: "png",
        quality: 1.0,
        backgroundColor: "#ffffff",
    };

    if (typeof snapdom === "undefined") {
        console.error("Snapdom library not loaded.");
        alert("❌ Snapdom failed to load. Please check the @require URL.");
        return;
    }

    function showNotification(message, type = "info") {
        if (typeof GM_notification !== "undefined") {
            GM_notification({
                text: message,
                title: "📸 Screen Capture Pro",
                timeout: 5000,
            });
        } else {
            const colors = {
                success: "#4CAF50",
                error: "#f44336",
                info: "#2196F3",
                warning: "#FF9800",
            };
            const el = document.createElement("div");
            el.style.cssText = `
                position: fixed; bottom: 20px; right: 20px;
                background: ${colors[type] || colors.info};
                color: white; padding: 15px 25px; border-radius: 8px;
                z-index: 999999; font-family: Arial, sans-serif;
                font-size: 14px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                max-width: 400px;
            `;
            el.textContent = message;
            document.body.appendChild(el);
            setTimeout(() => el.remove(), 5000);
        }
    }

    function copyToClipboard(text) {
        try {
            GM_setClipboard(text, "text");
            showNotification("✅ Copied to clipboard!", "success");
            return;
        } catch (e) {}

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard
                .writeText(text)
                .then(() => showNotification("✅ Copied to clipboard!", "success"))
                .catch(() => fallbackCopyText(text));
            return;
        }

        fallbackCopyText(text);
    }

    function fallbackCopyText(text) {
        if (window.clipboardData && window.clipboardData.setData) {
            // IE fallback
            window.clipboardData.setData("Text", text);
            showNotification("✅ Copied to clipboard!", "success");
            return;
        }

        if (document.queryCommandSupported && document.queryCommandSupported("copy")) {
            const textarea = document.createElement("textarea");
            textarea.textContent = text;
            textarea.style.position = "fixed";
            textarea.style.left = "-99999px";
            textarea.style.top = "0";
            document.body.appendChild(textarea);
            textarea.select();
            try {
                document.execCommand("copy");
                showNotification("✅ Copied to clipboard!", "success");
            } catch (ex) {
                showNotification("❌ Copy failed. Please copy manually.", "error");
                console.warn("Copy failed:", ex);
            } finally {
                document.body.removeChild(textarea);
            }
        } else {
            const result = prompt("Copy to clipboard: Ctrl+C, Enter", text);
            if (result !== null) showNotification("✅ Copied!", "success");
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    function formatFilename(prefix, extension = "png") {
        const ts = new Date().toISOString().replace(/[:.]/g, "-");
        return `${prefix}_${ts}.${extension}`;
    }

    function getSelectedElement() {
        const sel = window.getSelection();
        if (sel.rangeCount > 0) {
            const range = sel.getRangeAt(0);
            let node = range.commonAncestorContainer;
            if (node.nodeType === 3) node = node.parentElement;
            if (node && node.tagName) {
                let selector = node.tagName.toLowerCase();
                if (node.id) selector += "#" + node.id;
                if (node.className) {
                    const classes = node.className
                        .split(" ")
                        .filter((c) => c)
                        .join(".");
                    if (classes) selector += "." + classes;
                }
                return selector;
            }
        }
        return "body";
    }

    function getVisibleArea() {
        return "body";
    }

    function fallbackImageCopy(imageData, canvas, filename, mimeType, quality) {
        showNotification("ℹ️ Clipboard not supported on this page, downloading...", "info");
        downloadImage(imageData, filename);
        // Maybe one day when GM_setClipboard supports image: https://github.com/Tampermonkey/tampermonkey/issues/1250
        // try {
        //         GM_setClipboard(imageData, 'html');
        //         showNotification('✅ Screenshot copied as DataURL/HTML!', 'success');
        //     } catch (e) {
        //         showNotification('ℹ️ Clipboard not supported on this page, downloading...', 'info');
        //         downloadImage(imageData, filename);
        //     }
    }

    async function captureScreenshot(selector, options = {}) {
        const {
            scale = CONFIG.defaultScale,
            format = CONFIG.defaultFormat,
            quality = CONFIG.quality,
            filename = "screenshot",
            backgroundColor = CONFIG.backgroundColor,
            fullPage = false,
            copyToClipboard: wantCopy = false,
            delay = 0,
        } = options;

        let targetElement;
        if (fullPage) {
            targetElement = document.documentElement;
        } else {
            targetElement = document.querySelector(selector);
            if (!targetElement) {
                showNotification(`❌ Element "${selector}" not found!`, "error");
                return;
            }
        }

        if (delay > 0) {
            showNotification(`⏱️ Capturing in ${delay} seconds...`, "warning");
            await new Promise((r) => setTimeout(r, delay * 1000));
        }

        try {
            const result = await snapdom(targetElement, { scale, backgroundColor });
            const canvas = await result.toCanvas();

            const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
            const imageData = canvas.toDataURL(mimeType, quality);

            if (wantCopy) {
                if (navigator.clipboard && typeof navigator.clipboard.write === "function") {
                    canvas.toBlob(
                        (blob) => {
                            navigator.clipboard
                                .write([new ClipboardItem({ [blob.type]: blob })])
                                .then(() => {
                                    showNotification("✅ Screenshot copied to clipboard!", "success");
                                })
                                .catch(() => {
                                    showNotification("ℹ️ Clipboard copy failed, downloading...", "info");
                                    downloadImage(imageData, filename);
                                });
                        },
                        mimeType,
                        quality,
                    );
                } else {
                    fallbackImageCopy(imageData, canvas, filename, mimeType, quality);
                }
            } else {
                downloadImage(imageData, filename);
            }
        } catch (err) {
            console.error("Capture error:", err);
            showNotification("❌ Failed to capture screenshot", "error");
        }
    }

    function downloadImage(imageData, filename) {
        const link = document.createElement("a");
        link.href = imageData;
        link.download = formatFilename(filename);
        document.body.appendChild(link);
        link.click();
        setTimeout(() => link.remove(), 100);
        showNotification("✅ Screenshot saved!", "success");
    }

    // ─── Menu Commands ──────────────────────────────────────────────────────
    GM_registerMenuCommand("📸 Capture Full Page", function () {
        captureScreenshot("body", { fullPage: true, scale: 2, filename: "fullpage", delay: 1 });
    });

    GM_registerMenuCommand("🖥️ Capture Visible Area", function () {
        captureScreenshot(getVisibleArea(), { scale: 2, filename: "visible", delay: 0.5 });
    });

    GM_registerMenuCommand("🎯 Capture Element (Selector)", function () {
        const selector = prompt("Enter CSS selector (e.g., #content, .header, main):", "body");
        if (selector) {
            captureScreenshot(selector, {
                scale: 2,
                filename: `element_${selector.replace(/[^a-z0-9]/gi, "_")}`,
                delay: 1,
            });
        }
    });

    GM_registerMenuCommand("📍 Capture Selected Element", function () {
        const selector = getSelectedElement();
        captureScreenshot(selector, {
            scale: 2,
            filename: `selected_${selector.replace(/[^a-z0-9]/gi, "_")}`,
            delay: 1,
        });
    });

    GM_registerMenuCommand("🔬 High Resolution (4x DPR)", function () {
        captureScreenshot("body", { fullPage: true, scale: 4, filename: "highres_4x", delay: 2 });
    });

    GM_registerMenuCommand("⏱️ Screenshot with Delay (5s)", function () {
        captureScreenshot("body", { fullPage: true, scale: 2, filename: "delayed", delay: 5 });
    });

    GM_registerMenuCommand("📷 JPEG Screenshot", function () {
        captureScreenshot("body", {
            fullPage: true,
            scale: 1.5,
            format: "jpeg",
            quality: 0.9,
            filename: "screenshot_jpeg",
            delay: 1,
        });
    });

    GM_registerMenuCommand("📋 Copy Screenshot to Clipboard", function () {
        captureScreenshot("body", {
            fullPage: true,
            scale: 2,
            filename: "clipboard",
            copyToClipboard: true,
            delay: 1,
        });
    });

    GM_registerMenuCommand("✨ Transparent Background", function () {
        captureScreenshot("body", {
            fullPage: true,
            scale: 2,
            backgroundColor: "transparent",
            filename: "transparent",
            delay: 1,
        });
    });

    GM_registerMenuCommand("⚙️ Custom Screenshot", function () {
        const opts = {
            selector: prompt("CSS Selector (or 'body' for full page):", "body") || "body",
            scale: parseInt(prompt("Scale/DPR (1-4, default 2):", "2")) || 2,
            format: prompt("Format (png/jpeg, default png):", "png") || "png",
            delay: parseInt(prompt("Delay in seconds (0-10):", "1")) || 1,
            fullPage: confirm("Capture full page? (OK = Yes, Cancel = No)"),
            copyToClipboard: confirm("Copy to clipboard instead of downloading? (OK = Yes, Cancel = No)"),
        };
        captureScreenshot(opts.selector, {
            fullPage: opts.fullPage,
            scale: opts.scale,
            format: opts.format,
            delay: opts.delay,
            copyToClipboard: opts.copyToClipboard,
            filename: "custom_screenshot",
        });
    });

    GM_registerMenuCommand("🔄 Batch Capture (PNG + JPEG)", function () {
        showNotification("📸 Capturing in both formats...", "info");
        captureScreenshot("body", { fullPage: true, scale: 2, format: "png", filename: "batch_png", delay: 1 });
        setTimeout(() => {
            captureScreenshot("body", {
                fullPage: true,
                scale: 2,
                format: "jpeg",
                quality: 0.9,
                filename: "batch_jpeg",
                delay: 0,
            });
        }, 2000);
    });

    GM_registerMenuCommand("❓ Help & Info (Firefox Commands)", function () {
        const help = `
        📸 SCREEN CAPTURE PRO - HELP & FIREFOX COMMANDS

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        📋 MANUAL FIREFOX COMMANDS (Web Console)
        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        1️⃣ FULL PAGE     :screenshot --dpr 2 --fullpage
        2️⃣ VISIBLE AREA  :screenshot --dpr 2
        3️⃣ ELEMENT       :screenshot --dpr 2 --selector "#element"
        4️⃣ SELECTED      :screenshot --dpr 2 --selector "#selected"
        5️⃣ HIGH RES      :screenshot --dpr 4 --fullpage
        6️⃣ DELAY (5s)    :screenshot --dpr 2 --fullpage --delay 5
        7️⃣ JPEG FORMAT   :screenshot --dpr 2 --fullpage --type jpeg
        8️⃣ CLIPBOARD     :screenshot --dpr 2 --fullpage --clipboard
        9️⃣ TRANSPARENT   :screenshot --dpr 2 --fullpage --background transparent
        🔟 CUSTOM        :screenshot --dpr 2 --fullpage --delay 2
        1️⃣1️⃣ BATCH      :screenshot --dpr 2 --fullpage & :screenshot --dpr 2 --fullpage --type jpeg

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        🔧 ADDITIONAL FIREFOX PARAMETERS
        --dpr NUMBER       Device pixel ratio (1-4)
        --fullpage         Capture entire page
        --delay SECONDS    Wait before capturing
        --type FORMAT      png or jpeg
        --clipboard        Copy to clipboard
        --background COLOR Background color or transparent

        ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        💡 TIPS
        • Open Web Console: Ctrl+Shift+K (Windows/Linux)
        • Higher DPR = Better quality but larger files
        • Transparent BG only works without page backgrounds

        Version: 3.2 | Engine: Snapdom | Firefox Native Commands
        `;
        alert(help);
    });

    console.log("%c📸 Screen Capture Pro (Snapdom) loaded!", "font-weight:bold;color:#4CAF50;");
})();

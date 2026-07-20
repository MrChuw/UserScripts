// ==UserScript==
// @name         Screen Capture
// @namespace    http://tampermonkey.net/
// @version      0.1.2
// @author       MrChuw
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
        defaultFormat: "jpg",
        quality: 0.9,
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
    function formatFilename(prefix, extension = "jpg") {
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

            const isJpeg = format === "jpg" || format === "jpeg";
            const mimeType = isJpeg ? "image/jpeg" : "image/png";
            const ext = isJpeg ? "jpg" : "png";
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
                                    downloadImage(imageData, filename, ext);
                                });
                        },
                        mimeType,
                        quality,
                    );
                } else {
                    fallbackImageCopy(imageData, canvas, filename, mimeType, quality);
                }
            } else {
                downloadImage(imageData, filename, ext);
            }
        } catch (err) {
            console.error("Capture error:", err);
            showNotification("❌ Failed to capture screenshot", "error");
        }
    }

    function downloadImage(imageData, filename, extension = "jpg") {
        const link = document.createElement("a");
        link.href = imageData;
        link.download = formatFilename(filename, extension);
        document.body.appendChild(link);
        link.click();
        setTimeout(() => link.remove(), 100);
        showNotification("✅ Screenshot saved!", "success");
    }

    function registerMenus() {
        GM_registerMenuCommand("📸 Capture Full Page", function () {
            captureScreenshot("body", {
                fullPage: true,
                scale: 2,
                filename: "fullpage",
                delay: 1,
            });
        });

        GM_registerMenuCommand("🖥️ Capture Visible Area", function () {
            captureScreenshot(getVisibleArea(), {
                scale: 2,
                filename: "visible",
                delay: 0.5,
            });
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
            captureScreenshot("body", {
                fullPage: true,
                scale: 4,
                filename: "highres_4x",
                delay: 2,
            });
        });

        GM_registerMenuCommand("🔬 Higher Resolution (6x DPR)", function () {
            captureScreenshot("body", {
                fullPage: true,
                scale: 6,
                filename: "highres_6x",
                delay: 2,
            });
        });

        GM_registerMenuCommand("⏱️ Screenshot with Delay (5s)", function () {
            captureScreenshot("body", {
                fullPage: true,
                scale: 2,
                filename: "delayed",
                delay: 5,
            });
        });

        GM_registerMenuCommand("📷 PNG Screenshot", function () {
            captureScreenshot("body", {
                fullPage: true,
                scale: 1.5,
                format: "png",
                quality: 0.9,
                filename: "screenshot_png",
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
                format: "png",
                backgroundColor: "transparent",
                filename: "transparent",
                delay: 1,
            });
        });

        GM_registerMenuCommand("⚙️ Custom Screenshot", function () {
            const opts = {
                selector: prompt("CSS Selector (or 'body' for full page):", "body") || "body",
                scale: parseInt(prompt("Scale/DPR (1-4, default 2):", "2")) || 2,
                format: prompt("Format (png/jpeg, default jpg):", "jpg") || "jpg",
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
            captureScreenshot("body", {
                fullPage: true,
                scale: 2,
                format: "png",
                filename: "batch_png",
                delay: 1,
            });

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
            const existingModal = document.getElementById("sc-help-modal");
            if (existingModal) existingModal.remove();

            const commandsText = `1️⃣ FULL PAGE      :screenshot --dpr 2 --fullpage --type jpeg
2️⃣ VISIBLE AREA   :screenshot --dpr 2 --type jpeg
3️⃣ ELEMENT        :screenshot --dpr 2 --selector "#element" --type jpeg
4️⃣ SELECTED       :screenshot --dpr 2 --selector "#selected" --type jpeg
5️⃣ HIGH RES       :screenshot --dpr 4 --fullpage --type jpeg
6️⃣ HIGH HIGH RES  :screenshot --dpr 6 --fullpage --type jpeg
7️⃣ DELAY (5s)     :screenshot --dpr 2 --fullpage --delay 5 --type jpeg
8️⃣ PNG FORMAT     :screenshot --dpr 2 --fullpage --type png
9️⃣ CLIPBOARD      :screenshot --dpr 2 --fullpage --clipboard --type jpeg
🔟 TRANSPARENT    :screenshot --dpr 2 --fullpage --background transparent
1️⃣1️⃣ CUSTOM       :screenshot --dpr 2 --fullpage --delay 2 --type jpeg
1️⃣2️⃣ BATCH        :screenshot --dpr 2 --fullpage & :screenshot --dpr 2 --fullpage --type jpeg`;

            const paramsText = `--dpr NUMBER        Device pixel ratio (1-6)
--fullpage          Capture entire page
--delay SECONDS     Wait before capturing
--type FORMAT       png or jpeg
--clipboard         Copy to clipboard
--background COLOR  Background color or transparent`;

            const tipsText = `• Open Web Console: Ctrl+Shift+K (Windows/Linux)
• Higher DPR = Better quality but larger files
• Transparent BG only works without page backgrounds`;

            const footerText = "Version: 0.1.2 | Engine: Snapdom | Firefox Native Commands";

            const modal = document.createElement("div");
            modal.id = "sc-help-modal";
            modal.style.cssText = `
                position: fixed;
                top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(0, 0, 0, 0.75);
                backdrop-filter: blur(4px);
                z-index: 9999999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            `;

            const content = document.createElement("div");
            content.style.cssText = `
                background: #1e1e2e;
                color: #cdd6f4;
                padding: 28px;
                border-radius: 12px;
                width: max-content;
                max-width: min(880px, 92vw);
                max-height: 88vh;
                display: flex;
                flex-direction: column;
                box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
                border: 1px solid #45475a;
                overflow-y: auto;
            `;

            function createSectionHeader(title) {
                const wrap = document.createElement("div");
                wrap.style.cssText = "text-align: center; margin-bottom: 8px;";
                wrap.innerHTML = `
                    <div style="color: #6c7086; margin-bottom: 6px;">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
                    <div style="font-weight: bold; color: #f9e2af; margin-bottom: 6px;">${title}</div>
                    <div style="color: #6c7086; margin-bottom: 10px;">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</div>
                `;
                return wrap;
            }

            function createCodeBlock(text) {
                const wrap = document.createElement("div");
                wrap.style.cssText = "text-align: center; margin-bottom: 20px;";

                const pre = document.createElement("pre");
                pre.style.cssText = `
                    font-family: 'JetBrains Mono', 'Fira Code', 'Courier New', monospace;
                    font-size: 13px;
                    line-height: 1.6;
                    text-align: left;
                    display: inline-block;
                    margin: 0;
                    color: #a6adc8;
                    white-space: pre;
                `;
                pre.textContent = text;
                wrap.appendChild(pre);
                return wrap;
            }

            const titleEl = document.createElement("h3");
            titleEl.textContent = "📸 SCREEN CAPTURE - HELP & FIREFOX COMMANDS";
            titleEl.style.cssText =
                "margin: 0 0 20px 0; color: #89b4fa; font-size: 18px; font-weight: bold; text-align: center;";
            content.appendChild(titleEl);

            content.appendChild(createSectionHeader("📋 MANUAL FIREFOX COMMANDS (Web Console)"));
            content.appendChild(createCodeBlock(commandsText));

            content.appendChild(createSectionHeader("🔧 ADDITIONAL FIREFOX PARAMETERS"));
            content.appendChild(createCodeBlock(paramsText));

            content.appendChild(createSectionHeader("💡 TIPS"));
            const tipsEl = document.createElement("div");
            tipsEl.style.cssText =
                "text-align: center; font-size: 13px; color: #a6adc8; line-height: 1.6; margin-bottom: 20px; white-space: pre-line;";
            tipsEl.textContent = tipsText;
            content.appendChild(tipsEl);

            const footerEl = document.createElement("div");
            footerEl.textContent = footerText;
            footerEl.style.cssText = "text-align: center; font-size: 12px; color: #6c7086; margin-bottom: 16px;";
            content.appendChild(footerEl);

            const closeBtn = document.createElement("button");
            closeBtn.textContent = "Close";
            closeBtn.style.cssText = `
                align-self: center;
                background: #89b4fa;
                color: #11111b;
                border: none;
                padding: 8px 24px;
                border-radius: 6px;
                font-weight: bold;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            `;
            closeBtn.onmouseover = () => (closeBtn.style.background = "#b4befe");
            closeBtn.onmouseout = () => (closeBtn.style.background = "#89b4fa");
            closeBtn.onclick = () => modal.remove();
            content.appendChild(closeBtn);

            // Close Events
            modal.onclick = (e) => {
                if (e.target === modal) modal.remove();
            };
            const escHandler = (e) => {
                if (e.key === "Escape") {
                    modal.remove();
                    document.removeEventListener("keydown", escHandler);
                }
            };
            document.addEventListener("keydown", escHandler);

            modal.appendChild(content);
            document.body.appendChild(modal);
        });
    }

    setTimeout(registerMenus, 300);
    console.log("%c📸 Screen Capture Pro (Snapdom) loaded!", "font-weight:bold;color:#4CAF50;");
})();

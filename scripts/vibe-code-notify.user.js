// ==UserScript==
// @name         GitHub Vibe Coded Notifier
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Caches repository file lists to re-evaluate vibe-coded status when rules change.
// @author       MrChuw
// @match        https://github.com/*/*
// @match        https://github.com/*/*/*
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/MrChuw/UserScripts/raw/main/scripts/vibe-code-notify.user.js
// @downloadURL  https://raw.githubusercontent.com/MrChuw/UserScripts/raw/main/scripts/vibe-code-notify.user.js
// ==/UserScript==

(function () {
    "use strict";

    // =========================================================
    // Configuration
    // =========================================================

    const DEBUG_LOGS = false;
    const GITHUB_API_TOKEN = "";

    // 1. REPO CACHE TTL
    const REPO_CACHE_HOURS = 24;

    // 2. REMOTE RULES CONFIG
    const REMOTE_RULES_URL =
        "https://gist.githubusercontent.com/MrChuw/e66f574692da9d32f5632061ec261ce2/raw/slop_extensions.txt"; // Other rules one per line
    const REMOTE_LIST_TTL_MINUTES = 2;

    const STATIC_TARGET_FILES = [
        ".claude",
        "cursorrules",
        "custominstructions",
        "custom_instructions",
        "claude.md",
        "agents.md",
        "gemini.md",
        "claude.yml",
        "claude.yaml",
    ];

    // =========================================================
    // State & Constants
    // =========================================================
    const LS_PREFIX_REPO = "vibeRepoFiles:";
    const LS_PREFIX_REMOTE = "vibeRemoteRules";
    const LS_PREFIX_HIDE = "vibeHidePopout:";

    let effectiveTargetFiles = new Set(STATIC_TARGET_FILES.map((s) => s.toLowerCase()));
    let lastCheckedRepoKey = null;
    let checkScheduled = false;

    // =========================================================
    // Helpers
    // =========================================================
    function log(...args) {
        if (DEBUG_LOGS) console.log("%c[Gh Vibe Coded]", "color: #00ff00; font-weight: bold", ...args);
    }

    function getRepoKey() {
        const parts = location.pathname.split("/").filter(Boolean);
        if (parts.length < 2) return null;
        return `${parts[0]}/${parts[1]}`;
    }

    // =========================================================
    // Cache Logic (Saving JSON instead of Boolean)
    // =========================================================

    function getCachedFileList(repoKey) {
        const raw = localStorage.getItem(LS_PREFIX_REPO + repoKey);
        if (!raw) return null;
        try {
            const data = JSON.parse(raw);
            const ageMs = Date.now() - data.timestamp;
            if (ageMs < REPO_CACHE_HOURS * 60 * 60 * 1000) {
                return data.files;
            }
            localStorage.removeItem(LS_PREFIX_REPO + repoKey);
            return null;
        } catch (e) {
            return null;
        }
    }

    function setCachedFileList(repoKey, filesArray) {
        const data = {
            files: filesArray,
            timestamp: Date.now(),
        };
        localStorage.setItem(LS_PREFIX_REPO + repoKey, JSON.stringify(data));
    }

    // =========================================================
    // Rules Processing
    // =========================================================

    async function updateRules() {
        const combinedRaw = new Set(STATIC_TARGET_FILES.map((s) => s.toLowerCase()));
        const rawRemote = localStorage.getItem(LS_PREFIX_REMOTE);
        let useNetwork = true;
        if (rawRemote) {
            try {
                const data = JSON.parse(rawRemote);
                if (Date.now() - data.timestamp < REMOTE_LIST_TTL_MINUTES * 60 * 1000) {
                    data.files.forEach((f) => combinedRaw.add(f.toLowerCase()));
                    useNetwork = false;
                    log("Using cached rules");
                }
            } catch (e) {
                log("Cache parse error", e);
            }
        }
        if (useNetwork && REMOTE_RULES_URL) {
            log("Fetching fresh rules...");
            try {
                const resp = await fetch(REMOTE_RULES_URL);
                if (resp.ok) {
                    const text = await resp.text();
                    const lines = text
                        .split(/\r?\n/)
                        .map((l) => l.trim())
                        .filter((l) => l && !l.startsWith("#"));
                    lines.forEach((l) => combinedRaw.add(l.toLowerCase()));
                    localStorage.setItem(LS_PREFIX_REMOTE, JSON.stringify({ files: lines, timestamp: Date.now() }));
                }
            } catch (e) {
                log("Rules fetch failed", e);
            }
        }
        effectiveTargetFiles = Array.from(combinedRaw).map((rule) => {
            const pattern = rule.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, ".*");

            return new RegExp(`^${pattern}$`, "i");
        });

        log("Rules initialized with", effectiveTargetFiles.length, "patterns");
    }

    function isVibeCoded(fileList) {
        if (!fileList) return false;
        return fileList.some((name) => {
            const n = name.toLowerCase();
            return effectiveTargetFiles.some((regex) => regex.test(n));
        });
    }

    // =========================================================
    // Core Execution
    // =========================================================

    async function checkRepo() {
        const repoKey = getRepoKey();
        if (!repoKey || repoKey === lastCheckedRepoKey) return;
        lastCheckedRepoKey = repoKey;
        if (localStorage.getItem(LS_PREFIX_HIDE + repoKey) === "1") return;
        let files = getCachedFileList(repoKey);
        if (!files) {
            const [owner, repo] = repoKey.split("/");
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;

            try {
                log("Fetching file list from API...");
                const headers = { Accept: "application/vnd.github.v3+json" };
                if (GITHUB_API_TOKEN) headers["Authorization"] = `Bearer ${GITHUB_API_TOKEN}`;

                const resp = await fetch(apiUrl, { headers });
                if (resp.ok) {
                    const json = await resp.json();
                    files = Array.isArray(json) ? json.map((i) => i.name) : [];
                    setCachedFileList(repoKey, files);
                }
            } catch (e) {
                log("API Error", e);
            }
        }
        if (!files || files.length === 0) {
            log("Falling back to DOM detection...");
            files = Array.from(document.querySelectorAll('div[role="row"] a[title], a.js-navigation-open[title]'))
                .map((el) => el.getAttribute("title"))
                .filter(Boolean);
        }
        if (files && isVibeCoded(files)) {
            log("Vibe coded detected for", repoKey);
            showPopout(repoKey);
        } else {
            log("Repo is clean (or no files found)");
        }
    }

    // =========================================================
    // UI (Same as before with minor tweaks)
    // =========================================================
    function showPopout(repoKey) {
        if (document.getElementById("vibe-coded-popout")) return;

        const container = document.createElement("div");
        container.id = "vibe-coded-popout";
        Object.assign(container.style, {
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: "99999",
            maxWidth: "380px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
            borderRadius: "12px",
            overflow: "hidden",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial",
        });

        const card = document.createElement("div");
        Object.assign(card.style, {
            background: "linear-gradient(180deg, #fff, #fbfbfd)",
            border: "1px solid rgba(27,31,35,0.08)",
            padding: "16px",
        });

        // Header
        const header = document.createElement("div");
        Object.assign(header.style, { display: "flex", justifyContent: "space-between", alignItems: "center" });

        const title = document.createElement("div");
        title.innerHTML = "Vibe coded repository";
        title.style.fontWeight = "600";

        const closeBtn = document.createElement("button");
        closeBtn.textContent = "✕";
        Object.assign(closeBtn.style, {
            border: "none",
            background: "transparent",
            cursor: "pointer",
            fontSize: "14px",
        });
        closeBtn.onclick = () => container.remove();

        header.append(title, closeBtn);
        card.appendChild(header);

        // Body
        const msg = document.createElement("div");
        msg.style.marginTop = "10px";
        msg.textContent = "This repository contains AI assistant configuration files.";
        card.appendChild(msg);

        // Footer
        const actions = document.createElement("div");
        Object.assign(actions.style, {
            marginTop: "16px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
        });

        // Checkbox
        const left = document.createElement("label");
        Object.assign(left.style, {
            display: "flex",
            alignItems: "center",
            fontSize: "12px",
            cursor: "pointer",
            color: "#57606a",
        });
        const chk = document.createElement("input");
        chk.type = "checkbox";
        chk.style.marginRight = "6px";
        const chkText = document.createElement("span");
        chkText.textContent = "Don't show again";
        left.append(chk, chkText);

        // Buttons
        const right = document.createElement("div");
        right.style.display = "flex";
        right.style.gap = "8px";

        const exitBtn = document.createElement("button");
        exitBtn.textContent = "Leave";
        Object.assign(exitBtn.style, {
            border: "1px solid rgba(209, 36, 47, 0.3)",
            background: "#fff",
            color: "#cf222e",
            padding: "6px 12px",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "500",
        });
        exitBtn.onclick = () => {
            window.location.href = "https://github.com";
        };

        const okBtn = document.createElement("button");
        okBtn.textContent = "Stay";
        Object.assign(okBtn.style, {
            border: "1px solid rgba(27,31,35,0.15)",
            background: "#f6f8fa",
            color: "#24292f",
            padding: "6px 12px",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: "500",
        });
        okBtn.onclick = () => {
            if (chk.checked) localStorage.setItem(LS_PREFIX_HIDE + repoKey, "1");
            container.remove();
        };

        right.append(exitBtn, okBtn);
        actions.append(left, right);
        card.appendChild(actions);

        container.appendChild(card);
        document.body.appendChild(container);
    }

    function scheduleCheck(delay = 300) {
        if (checkScheduled) return;
        checkScheduled = true;
        setTimeout(() => {
            checkScheduled = false;
            void checkRepo();
        }, delay);
    }

    async function init() {
        await updateRules();
        scheduleCheck(500);
        document.addEventListener("pjax:end", () => scheduleCheck(400));
        document.addEventListener("turbo:load", () => scheduleCheck(400));
        window.addEventListener("popstate", () => scheduleCheck(400));
    }

    init();
})();

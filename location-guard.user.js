// ==UserScript==
// @name            Location Guard (No UI)
// @description     Hide/spoof your geographic location from websites. No interface.
// @version         0.2.2
// @author          MrChuw
// @match           *://*/*
// @run-at          document-end
// @grant           unsafeWindow
// @grant           GM_getValue
// @grant           GM_setValue
// @grant           GM.getValue
// @grant           GM.setValue
// @grant           GM_deleteValue
// @grant           GM.deleteValue
// @grant           GM_addValueChangeListener
// @grant           GM_removeValueChangeListener
// @grant           GM.addValueChangeListener
// @grant           GM.removeValueChangeListener
// @updateURL       https://github.com/MrChuw/UserScripts/raw/main/location-guard.user.js
// @downloadURL     https://github.com/MrChuw/UserScripts/raw/main/location-guard.user.js
// @tag             privacy
// @tag             location
// @tag             spoof
// ==/UserScript==

// Original version by: https://github.com/SukkaW/location-guard-ng

(function () {
    'use strict';

    // ==== CONFIGURATION START ====
    const ENABLE_LOG = false;

    const CONFIG = {
        defaultLevel: 'fixed', // options: fixed, real, low, medium, high
        paused: false,
        cachedPos: {},
        fixedPos: {
            latitude: -10.65,
            longitude: -52.95
        },
        updateAccuracy: true,
        epsilon: 2,
        levels: {
            low: { radius: 200, cacheTime: 10 },
            medium: { radius: 500, cacheTime: 30 },
            high: { radius: 2000, cacheTime: 60 }
        }
    };

    // ==== LOG FUNCTION ====
    function log(...args) {
        if (ENABLE_LOG) console.log('[Location Guard]', ...args);
    }

    // ==== STORAGE UTILITIES ====
    const DEFAULT_VALUE = CONFIG;
    function getStoredValueAsync(key, providedDefaultValue) {
        return GM.getValue(key, providedDefaultValue ?? DEFAULT_VALUE[key]);
    }
    function setStoredValueAsync(key, value) {
        return GM.setValue(key, value);
    }

    function klona(x) {
        if (typeof x !== 'object') return x;
        const str = Object.prototype.toString.call(x);
        if (str === '[object Object]') {
            const tmp = {};
            for (const k in x) {
                tmp[k] = klona(x[k]);
            }
            return tmp;
        }
        if (str === '[object Array]') {
            return x.map(klona);
        }
        if (str === '[object Date]') return new Date(+x);
        if (str === '[object RegExp]') return new RegExp(x.source, x.flags);
        return x;
    }

    function randomInt(from, to) {
        return Math.floor(Math.random() * (to - from + 1)) + from;
    }

    const isMobileDevice = (() => {
        const pattern = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
        return pattern.test(navigator.userAgent);
    })();

    // ========= Laplace Mechanism =========
    const PlanarLaplace = {
        rad_of_deg: (ang) => ang * Math.PI / 180,
        deg_of_rad: (ang) => ang * 180 / Math.PI,
        getLatLon({ x, y }) {
            const rLon = x / this.earth_radius;
            const rLat = 2 * Math.atan(Math.exp(y / this.earth_radius)) - Math.PI / 2;
            return {
                latitude: this.deg_of_rad(rLat),
                longitude: this.deg_of_rad(rLon)
            };
        },
        getCartesian({ latitude, longitude }) {
            return {
                x: this.earth_radius * this.rad_of_deg(longitude),
                y: this.earth_radius * Math.log(Math.tan(Math.PI / 4 + this.rad_of_deg(latitude) / 2))
            };
        },
        LambertW(x) {
            const min_diff = 1e-10;
            if (x === -1 / Math.E) return -1;
            if (x < 0 && x > -1 / Math.E) {
                let q = Math.log(-x), p = 1;
                while (Math.abs(p - q) > min_diff) {
                    p = (q * q + x / Math.exp(q)) / (q + 1);
                    q = (p * p + x / Math.exp(p)) / (p + 1);
                }
                return Math.round(1000000 * q) / 1000000;
            }
            return x === 0 ? 0 : 0;
        },
        inverseCumulativeGamma(epsilon, z) {
            const x = (z - 1) / Math.E;
            return -(this.LambertW(x) + 1) / epsilon;
        },
        alphaDeltaAccuracy(epsilon, delta) {
            return this.inverseCumulativeGamma(epsilon, delta);
        },
        addNoise(epsilon, pos) {
            const theta = Math.random() * 2 * Math.PI;
            const z = Math.random();
            const r = this.inverseCumulativeGamma(epsilon, z);
            return this.addVectorToPos(pos, r, theta);
        },
        addVectorToPos({ latitude, longitude }, distance, angle) {
            const R = this.earth_radius;
            const ang_distance = distance / R;
            const lat1 = this.rad_of_deg(latitude);
            const lon1 = this.rad_of_deg(longitude);
            const lat2 = Math.asin(Math.sin(lat1) * Math.cos(ang_distance) + Math.cos(lat1) * Math.sin(ang_distance) * Math.cos(angle));
            let lon2 = lon1 + Math.atan2(Math.sin(angle) * Math.sin(ang_distance) * Math.cos(lat1), Math.cos(ang_distance) - Math.sin(lat1) * Math.sin(lat2));
            lon2 = (lon2 + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
            return {
                latitude: this.deg_of_rad(lat2),
                longitude: this.deg_of_rad(lon2)
            };
        },
        earth_radius: 6378137
    };

    // ========= GeoSpoof Logic =========
    const watchPosition = navigator.geolocation.watchPosition;
    const getCurrentPosition = navigator.geolocation.getCurrentPosition;
    const clearWatch = navigator.geolocation.clearWatch;
    const handlers = new Map();
    const inFrame = window !== window.top;

    async function isWatchAllowed() {
        const level = await getStoredValueAsync('defaultLevel');
        const paused = await getStoredValueAsync('paused');
        return !inFrame && (paused || level === 'real');
    }

    async function addNoise(position) {
        const paused = await getStoredValueAsync('paused');
        const level = await getStoredValueAsync('defaultLevel');
        if (paused || level === 'real') ; else if (level === 'fixed') {
            const fixedPos = await getStoredValueAsync('fixedPos');
            position.coords = {
                latitude: fixedPos.latitude,
                longitude: fixedPos.longitude,
                accuracy: 10,
                altitude: isMobileDevice() ? randomInt(10, 100) : null,
                altitudeAccuracy: isMobileDevice() ? 10 : null,
                heading: isMobileDevice() ? randomInt(0, 360) : null,
                speed: null
            };
        } else {
            const cachedPos = await getStoredValueAsync('cachedPos');
            const storedEpsilon = await getStoredValueAsync('epsilon');
            const levels = await getStoredValueAsync('levels');
            if ('level' in cachedPos && cachedPos[level] && (Date.now() - cachedPos[level].epoch) / 60000 < cachedPos[level].cacheTime) {
                position = cachedPos[level].position;
                log('using cached', position);
            } else {
                // add noise
                const epsilon = storedEpsilon / levels[level].radius;
                const noisy = PlanarLaplace.addNoise(epsilon, position.coords);
                position.coords.latitude = noisy.latitude;
                position.coords.longitude = noisy.longitude;
                // update accuracy
                if (position.coords.accuracy && await getStoredValueAsync('updateAccuracy')) {
                    position.coords.accuracy += Math.round(PlanarLaplace.alphaDeltaAccuracy(epsilon, .9));
                }
                // don't know how to add noise to those, so we set to null (they're most likely null anyway)
                position.coords.altitude = null;
                position.coords.altitudeAccuracy = null;
                position.coords.heading = null;
                position.coords.speed = null;
                // cache
                cachedPos[level] = {
                    epoch: Date.now(),
                    position,
                    cacheTime: levels[level].cacheTime
                };
                await setStoredValueAsync('cachedPos', cachedPos);
                log('noisy coords', position.coords);
            }
        }
        return position;
    }

    async function getNoisyPosition(options) {
        const paused = await getStoredValueAsync('paused');
        const level = await getStoredValueAsync('defaultLevel');

        if (!paused && level === 'fixed') {
            const fixedPos = await getStoredValueAsync('fixedPos');
            return {
                success: true,
                position: {
                    coords: {
                        latitude: fixedPos.latitude,
                        longitude: fixedPos.longitude,
                        accuracy: 10,
                        altitude: null,
                        altitudeAccuracy: null,
                        heading: null,
                        speed: null
                    },
                    timestamp: Date.now()
                }
            };
        }

        return new Promise((resolve) => {
            getCurrentPosition.call(navigator.geolocation,
                async (pos) => {
                    const noisy = await addNoise(klona(pos));
                    resolve({ success: true, position: noisy });
                },
                (err) => resolve({ success: false, position: klona(err) }),
                options
            );
        });
    }

    function spoofLocation() {
        navigator.geolocation.getCurrentPosition = async function (cb1, cb2, opt) {
            const res = await getNoisyPosition(opt);
            if (res.success) cb1?.(res.position);
            else cb2?.(res.position);
        };

        navigator.geolocation.watchPosition = function (cb1, cb2, opt) {
            const id = Math.floor(Math.random() * 10000);
            (async () => {
                if (await isWatchAllowed()) {
                    const realId = watchPosition.call(navigator.geolocation, (pos) => cb1?.(pos), (err) => cb2?.(err), opt);
                    handlers.set(id, realId);
                } else {
                    navigator.geolocation.getCurrentPosition(cb1, cb2, opt);
                }
            })();
            return id;
        };

        navigator.geolocation.clearWatch = function (id) {
            if (handlers.has(id)) {
                clearWatch.call(navigator.geolocation, handlers.get(id));
                handlers.delete(id);
            }
        };
    }

    // Init
    spoofLocation();
})();

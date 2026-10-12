import { inject, markRaw, provide, reactive, ref, shallowRef } from 'vue';
import { buildMatch, parseOptions } from '../demo-radar/extract.js';
import { decodeIWI } from '../demo-radar/iwi.js';
import { densityImage, heatImage, heatPoints } from '../demo-radar/heat.js';
import {
    currentRoundIdx, firstRoundStart, idxAt, mapImageUrl, panelAt, playerSummary, prepareMatch, rangeBounds,
    roundJumpTarget, scoreboard,
} from '../demo-radar/match.js';
import {
    LANES, drawMap, drawTimeline, fitView, fromScreen, hitPlayer, timelineFraction, timelineHeight, zoomView,
} from '../demo-radar/renderer.js';
import { weaponLabel } from '../demo-radar/format.js';

const KEY = Symbol('demoRadar');

const DEMO_FILE = /\.dm_\d+$/i;
const IMAGE_FILE = /\.(png|jpe?g|webp|iwi)$/i;
const SPEEDS = [0.5, 1, 2, 4, 8];

const dpr = () => Math.max(1, window.devicePixelRatio || 1);

/**
 * Map area kept free by Fit (CSS px): the score HUD on top and, on wide maps, the tool column on the right
 * (mirrored left to stay centred). Narrow maps skip the sides, the margin would cost too much width there.
 */
const FIT_INSET = { top: 116, side: 52, bottom: 8 };
const FIT_SIDE_INSET_MIN_WIDTH = 640;

const canvasFromRgba = ({ rgba, size }) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas.getContext('2d').putImageData(new ImageData(rgba, size, size), 0, 0);

    return canvas;
};

/**
 * State and behaviour of the Demo Radar page. The match model holds large typed arrays, so it is kept out of
 * Vue's reactivity (markRaw / shallowRef); the canvas is redrawn from a requestAnimationFrame loop, and the side
 * panel only re-renders when what it shows changes (see panelAt().key).
 */
const createDemoRadar = () => {
    const library = shallowRef([]);
    const match = shallowRef(null);
    const loading = reactive({ active: false, file: '', progress: 0, error: '' });

    const playing = ref(false);
    const speed = ref(1);
    const range = ref(-1);
    const selected = ref(-1);
    const time = ref(0);
    const showGrenades = ref(true);
    const drawMode = ref(false);
    const hasStrokes = ref(false);
    const orient = ref('auto');
    const killFeed = ref(true);
    const fullscreen = ref(false);
    const mapMessage = ref(null);
    const tooltip = ref(null);
    const popover = ref(null);
    const panel = shallowRef(null);
    const stats = shallowRef([]);

    const heat = reactive({ type: 'off', team: 'all', side: 'all', player: -1, radius: 14, gain: 10, players: true });
    const layers = reactive({ names: true, cones: true, trails: false, shots: true, killLines: true, deaths: true, bomb: true, mapImage: true });

    // Not reactive: written every frame or holding canvases
    const S = {
        t: 0, view: { s: 600, ox: 0, oy: 0 }, strokes: [], dirty: true, hover: null, drag: null,
        mapImage: null, background: null, heat: null, heatKey: '', panelKey: '', mapCanvas: null, timelineCanvas: null,
        timelineDrag: false, laneLabels: {},
    };

    let frameId = 0;
    let lastFrame = 0;
    let resizeObserver = null;

    const invalidate = () => {
        S.dirty = true;
    };

    // ---------- loading
    const loadFiles = async (files) => {
        let last = null;

        for (const file of files) {
            loading.active = true;
            loading.file = file.name;
            loading.progress = 0;
            loading.error = '';

            try {
                const data = new Uint8Array(await file.arrayBuffer());
                const parsed = await buildMatch(data, file.name, (progress) => {
                    loading.progress = progress;
                });

                if (!parsed.n) {
                    throw new Error('no-snapshots');
                }

                const prepared = markRaw(prepareMatch(parsed, orient.value));
                library.value = [...library.value, prepared];
                last = prepared;
            } catch (error) {
                console.error(error);
                loading.error = error.message === 'no-snapshots' ? 'noSnapshots' : 'parseFailed';
                await new Promise((resolve) => setTimeout(resolve, 2500));
            }
        }

        loading.active = false;

        if (last) {
            openMatch(last);
        }
    };

    const loadMapImage = (m) => {
        S.mapImage = null;
        S.background = null;
        mapMessage.value = null;
        const url = mapImageUrl(m);

        if (!url) {
            mapMessage.value = {
                key: 'noImage',
                name: m.meta.minimap ? m.meta.minimap.material : m.meta.map,
                game: m.meta.game,
            };

            return;
        }

        fetch(url)
            .then((response) => {
                if (!response.ok) {
                    throw new Error(String(response.status));
                }

                return response.blob();
            })
            .then((blob) => createImageBitmap(blob))
            .then((image) => {
                if (match.value === m) {
                    S.mapImage = image;
                    invalidate();
                }
            })
            .catch(() => {
                if (match.value === m) {
                    mapMessage.value = { key: 'imageFailed', name: m.meta.map };
                }
            });
    };

    const loadMapImageFile = async (file) => {
        const data = new Uint8Array(await file.arrayBuffer());

        try {
            if (/\.iwi$/i.test(file.name)) {
                const image = decodeIWI(data);
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                canvas.getContext('2d').putImageData(new ImageData(image.rgba, image.width, image.height), 0, 0);
                S.mapImage = canvas;
            } else {
                S.mapImage = await createImageBitmap(new Blob([data]));
            }

            mapMessage.value = null;
            invalidate();
        } catch (error) {
            mapMessage.value = { key: 'customImageFailed', error: error.message };
        }
    };

    /** Files dropped anywhere on the page: images become the map image while a demo is open, demos are loaded. */
    const dropFiles = (files) => {
        const list = [...files];

        if (match.value && list.length && IMAGE_FILE.test(list[0].name)) {
            loadMapImageFile(list[0]);

            return;
        }

        const demos = list.filter((file) => DEMO_FILE.test(file.name));

        if (demos.length) {
            loadFiles(demos);
        }
    };

    // ---------- open / close
    const openMatch = (m) => {
        match.value = m;
        S.t = firstRoundStart(m);
        S.strokes = [];
        S.heatKey = '';
        S.heat = null;
        S.panelKey = '';
        range.value = -1;
        selected.value = -1;
        playing.value = false;
        hasStrokes.value = false;
        heat.player = -1;
        popover.value = null;
        stats.value = scoreboard(m);
        time.value = S.t;
        loadMapImage(m);
        requestAnimationFrame(() => {
            resize();
            fit();
        });
        invalidate();
    };

    const closeMatch = () => {
        playing.value = false;
        match.value = null;
        tooltip.value = null;
        popover.value = null;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    };

    const removeFromLibrary = (m) => {
        library.value = library.value.filter((item) => item !== m);
    };

    // ---------- view
    const resize = () => {
        for (const canvas of [S.mapCanvas, S.timelineCanvas]) {
            if (!canvas) {
                continue;
            }

            const rect = canvas.getBoundingClientRect();
            canvas.width = Math.max(1, Math.round(rect.width * dpr()));
            canvas.height = Math.max(1, Math.round(rect.height * dpr()));
        }

        invalidate();
    };

    const fit = () => {
        if (!match.value || !S.mapCanvas) {
            return;
        }

        const d = dpr();
        const side = S.mapCanvas.clientWidth >= FIT_SIDE_INSET_MIN_WIDTH ? FIT_INSET.side * d : 0;
        const inset = { top: FIT_INSET.top * d, right: side, bottom: FIT_INSET.bottom * d, left: side };

        S.view = fitView(match.value, S.mapCanvas.width, S.mapCanvas.height, inset);
        invalidate();
    };

    const zoom = (factor, sx, sy) => {
        if (!S.mapCanvas) {
            return;
        }

        S.view = zoomView(S.view, factor, sx ?? S.mapCanvas.width / 2, sy ?? S.mapCanvas.height / 2);
        invalidate();
    };

    // ---------- playback
    const bounds = () => rangeBounds(match.value, range.value);

    const seek = (t) => {
        if (!match.value) {
            return;
        }

        const [a, b] = bounds();
        S.t = Math.min(Math.max(t, a), b);
        invalidate();
    };

    const togglePlay = () => {
        if (!match.value) {
            return;
        }

        const [a, b] = bounds();

        if (!playing.value && S.t >= b - 10) {
            seek(a);
        }

        playing.value = !playing.value;
    };

    const setRange = (index) => {
        range.value = index;

        if (index >= 0) {
            seek(match.value.rounds[index].spawn - match.value.t0);
        }

        S.heatKey = '';
        invalidate();
    };

    const jumpRound = (direction) => {
        const m = match.value;

        if (!m || !m.rounds.length) {
            return;
        }

        const index = roundJumpTarget(m, m.t0 + S.t, direction);

        if (range.value >= 0) {
            setRange(index);
        } else {
            seek(m.rounds[index].spawn - m.t0);
        }
    };

    const seekToKill = (absoluteTime) => seek(absoluteTime - match.value.t0 - 2500);

    const currentRound = () => (match.value ? currentRoundIdx(match.value, match.value.t0 + S.t) : -1);

    // ---------- selection, heat, layers
    const selectPlayer = (cn) => {
        selected.value = cn;
        S.panelKey = '';
        invalidate();
    };

    const setHeat = (type) => {
        heat.type = type;
        S.heatKey = '';
        invalidate();
    };

    const updateHeat = (changes) => {
        Object.assign(heat, changes);
        S.heatKey = '';
        invalidate();
    };

    const toggleLayer = (name) => {
        layers[name] = !layers[name];
        invalidate();
    };

    const toggleGrenades = () => {
        showGrenades.value = !showGrenades.value;
        invalidate();
    };

    const toggleDraw = () => {
        drawMode.value = !drawMode.value;
    };

    const clearDrawings = () => {
        S.strokes = [];
        hasStrokes.value = false;
        invalidate();
    };

    const toggleKillFeed = () => {
        killFeed.value = !killFeed.value;
    };

    const openPopover = (cn, x, y) => {
        popover.value = { ...playerSummary(match.value, cn), x, y };
    };

    const heatForPlayer = (cn, type) => {
        heat.player = cn;
        setHeat(type);
        selectPlayer(cn);
        popover.value = null;
    };

    // ---------- map input (coordinates in CSS pixels relative to the canvas)
    const devicePoint = (x, y) => [x * dpr(), y * dpr()];

    const mapPointerDown = (x, y, button) => {
        const [dx, dy] = devicePoint(x, y);

        if (drawMode.value && button === 0) {
            S.strokes.push([fromScreen(S.view, dx, dy)]);
            hasStrokes.value = true;
            S.drag = { draw: true };

            return;
        }

        S.drag = { x: dx, y: dy, ox: S.view.ox, oy: S.view.oy, moved: false };
    };

    const mapPointerMove = (x, y, overCanvas) => {
        const [dx, dy] = devicePoint(x, y);
        const drag = S.drag;

        if (drag && drag.draw) {
            S.strokes[S.strokes.length - 1].push(fromScreen(S.view, dx, dy));
            invalidate();

            return;
        }

        if (drag) {
            if (Math.abs(dx - drag.x) + Math.abs(dy - drag.y) > 3) {
                drag.moved = true;
            }

            S.view = { ...S.view, ox: drag.ox + (dx - drag.x), oy: drag.oy + (dy - drag.y) };
            invalidate();

            return;
        }

        S.hover = overCanvas ? { x: dx, y: dy, cx: x, cy: y } : null;
        invalidate();
    };

    const mapPointerUp = (overCanvas) => {
        const drag = S.drag;

        if (drag && !drag.draw && !drag.moved && overCanvas && match.value) {
            const hit = hitPlayer(match.value, S.view, match.value.t0 + S.t, drag.x, drag.y, dpr());
            selectPlayer(hit ? hit.cn : -1);
        }

        S.drag = null;
    };

    const mapLeave = () => {
        S.hover = null;
        tooltip.value = null;
        invalidate();
    };

    const mapWheel = (deltaY, x, y) => {
        const [dx, dy] = devicePoint(x, y);
        zoom(Math.exp(-deltaY * 0.0015), dx, dy);
    };

    // ---------- timeline input
    const timelineSeek = (x, width) => {
        const [a, b] = bounds();
        seek(a + timelineFraction(x, width) * (b - a));
    };

    // ---------- keyboard
    const onKeydown = (event) => {
        if (!match.value || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
            return;
        }

        const actions = {
            ' ': () => togglePlay(),
            ArrowRight: () => seek(S.t + (event.shiftKey ? 30000 : 5000)),
            ArrowLeft: () => seek(S.t - (event.shiftKey ? 30000 : 5000)),
            ']': () => jumpRound(1),
            '[': () => jumpRound(-1),
            '+': () => zoom(1.25),
            '=': () => zoom(1.25),
            '-': () => zoom(0.8),
            f: () => fit(),
            g: () => toggleGrenades(),
            d: () => toggleDraw(),
            h: () => setHeat(heat.type === 'off' ? 'presence' : 'off'),
            Escape: () => {
                selectPlayer(-1);
                popover.value = null;

                if (drawMode.value) {
                    toggleDraw();
                }
            },
        };
        const action = actions[event.key];

        if (action) {
            if (event.key === ' ' || event.key.startsWith('Arrow')) {
                event.preventDefault();
            }

            action();
        }
    };

    // ---------- frame loop
    const buildHeat = () => {
        const m = match.value;
        const key = [m.meta.file, heat.type, heat.team, heat.side, heat.player, heat.radius, heat.gain, range.value, orient.value].join('|');

        if (key === S.heatKey) {
            return;
        }

        S.heatKey = key;
        const image = heatImage(m, heatPoints(m, heat, range.value), heat);
        S.heat = { canvas: canvasFromRgba(image), box: image.box };
    };

    const render = () => {
        const m = match.value;
        const T = m.t0 + S.t;

        if (S.mapCanvas) {
            const heatOn = heat.type !== 'off';

            if (heatOn) {
                buildHeat();
            }

            if (!S.mapImage && layers.mapImage && !S.background) {
                S.background = canvasFromRgba(densityImage(m));
            }

            drawMap(S.mapCanvas.getContext('2d'), {
                m, T, view: S.view, dpr: dpr(), layers, heatOn,
                showPlayers: !heatOn || heat.players,
                showGrenades: showGrenades.value,
                selected: selected.value,
                mapImage: S.mapImage,
                background: S.background,
                heat: heatOn ? S.heat : null,
                strokes: S.strokes,
            });

            // hover tooltip
            if (S.hover && !S.drag) {
                const hit = hitPlayer(m, S.view, T, S.hover.x, S.hover.y, dpr());

                if (hit) {
                    const k = idxAt(m, T);
                    const isPov = m.pov[k] === hit.s.p.cn;
                    tooltip.value = {
                        name: hit.s.p.name,
                        squad: hit.s.p.squad,
                        weapon: weaponLabel(m.weapons[hit.s.wpn - 1]),
                        hp: isPov ? m.hp[k] : null,
                        x: S.hover.cx + 14,
                        y: S.hover.cy + 10,
                    };
                } else {
                    tooltip.value = null;
                }
            }
        }

        const next = panelAt(m, T, selected.value);

        if (next.key !== S.panelKey) {
            S.panelKey = next.key;
            panel.value = next;
        }

        if (S.timelineCanvas) {
            const wanted = timelineHeight(LANES.length);

            if (Math.abs(S.timelineCanvas.clientHeight - wanted) > 1) {
                S.timelineCanvas.style.height = wanted + 'px';
                resize();
            }

            drawTimeline(S.timelineCanvas.getContext('2d'), {
                m, t: S.t, range: range.value, lanes: LANES, labels: S.laneLabels, dpr: dpr(),
            });
        }

        time.value = S.t;
    };

    const frame = (timestamp) => {
        const dt = Math.min(100, timestamp - lastFrame);
        lastFrame = timestamp;

        if (match.value) {
            if (playing.value) {
                const [, b] = bounds();
                S.t += dt * speed.value;

                if (S.t >= b) {
                    S.t = b;
                    playing.value = false;
                }

                S.dirty = true;
            }

            if (S.dirty) {
                S.dirty = false;
                render();
            }
        }

        frameId = requestAnimationFrame(frame);
    };

    /** Registers the map ('mapCanvas') or timeline ('timelineCanvas') canvas; both follow their CSS size. */
    const attachCanvas = (kind, canvas) => {
        resizeObserver = resizeObserver || new ResizeObserver(() => resize());
        S[kind] = canvas;
        resizeObserver.observe(canvas);
        resize();

        if (kind === 'mapCanvas') {
            fit();
        }
    };

    const detachCanvas = (kind) => {
        if (S[kind]) {
            resizeObserver?.unobserve(S[kind]);
        }

        S[kind] = null;
    };

    const onFullscreenChange = () => {
        fullscreen.value = Boolean(document.fullscreenElement);
        requestAnimationFrame(() => {
            resize();
            fit();
        });
    };

    const toggleFullscreen = (element) => {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else if (element?.requestFullscreen) {
            element.requestFullscreen();
        }
    };

    /** ?demo=<url>&t=<seconds>&round=<label>&heat=<type>&sel=<cn>&play=1&sync=1 - for testing only. */
    const loadFromQuery = async () => {
        const query = new URLSearchParams(window.location.search);
        const url = query.get('demo');

        if (!url) {
            return;
        }

        parseOptions.sync = Boolean(query.get('sync'));

        try {
            const response = await fetch(url);

            if (!response.ok) {
                throw new Error(response.status + ' ' + response.statusText);
            }

            const blob = await response.blob();
            await loadFiles([new File([blob], decodeURIComponent(url.split('/').pop()))]);
            const m = match.value;

            if (!m) {
                return;
            }

            if (query.get('t')) {
                seek(+query.get('t') * 1000);
            }

            if (query.get('round')) {
                const index = m.rounds.findIndex((r) => r.label === query.get('round'));

                if (index >= 0) {
                    setRange(index);
                }
            }

            if (query.get('heat')) {
                setHeat(query.get('heat'));
            }

            if (query.get('sel')) {
                selectPlayer(+query.get('sel'));
            }

            if (query.get('play')) {
                togglePlay();
            }
        } catch (error) {
            loading.error = 'urlFailed';
            console.error(error);
        }
    };

    const start = (laneLabels) => {
        S.laneLabels = laneLabels;
        window.addEventListener('keydown', onKeydown);
        document.addEventListener('fullscreenchange', onFullscreenChange);
        lastFrame = performance.now();
        frameId = requestAnimationFrame(frame);
        loadFromQuery();
    };

    const stop = () => {
        cancelAnimationFrame(frameId);
        window.removeEventListener('keydown', onKeydown);
        document.removeEventListener('fullscreenchange', onFullscreenChange);
        resizeObserver?.disconnect();
        resizeObserver = null;
    };

    const setLaneLabels = (labels) => {
        S.laneLabels = labels;
        invalidate();
    };

    return {
        SPEEDS,
        library, match, loading, playing, speed, range, selected, time, showGrenades, drawMode, hasStrokes,
        killFeed, fullscreen, mapMessage, tooltip, popover, panel, stats, heat, layers,
        loadFiles, dropFiles, loadMapImageFile, openMatch, closeMatch, removeFromLibrary,
        fit, zoom, seek, togglePlay, setRange, jumpRound, seekToKill, currentRound,
        selectPlayer, setHeat, updateHeat, toggleLayer, toggleGrenades, toggleDraw, clearDrawings,
        toggleKillFeed, openPopover, heatForPlayer, toggleFullscreen,
        mapPointerDown, mapPointerMove, mapPointerUp, mapLeave, mapWheel, timelineSeek,
        attachCanvas, detachCanvas, start, stop, setLaneLabels,
    };
};

/** Creates the Demo Radar state for a page and shares it with its child components. */
export const provideDemoRadar = () => {
    const radar = createDemoRadar();
    provide(KEY, radar);

    return radar;
};

export const useDemoRadar = () => inject(KEY);

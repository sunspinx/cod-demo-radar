<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import { formatClock } from '../../demo-radar/format';
import { teamColor } from '../../demo-radar/renderer';

const { t } = useI18n();
const radar = useDemoRadar();
const { panel, tooltip, mapMessage, drawMode, hasStrokes } = radar;

const canvas = ref(null);
const dragging = ref(false);

const local = (event) => {
    const rect = canvas.value.getBoundingClientRect();

    return [event.clientX - rect.left, event.clientY - rect.top];
};

const onPointerDown = (event) => {
    const [x, y] = local(event);
    dragging.value = !drawMode.value;
    radar.mapPointerDown(x, y, event.button);
};

const onWindowPointerMove = (event) => {
    if (!canvas.value) {
        return;
    }

    const [x, y] = local(event);
    radar.mapPointerMove(x, y, event.target === canvas.value);
};

const onWindowPointerUp = (event) => {
    dragging.value = false;
    radar.mapPointerUp(event.target === canvas.value);
};

const onWheel = (event) => {
    const [x, y] = local(event);
    radar.mapWheel(event.deltaY, x, y);
};

const roundLabel = computed(() => {
    const round = panel.value?.round;

    if (!round) {
        return t('demoRadar.panel.warmup');
    }

    return round.knife ? t('demoRadar.panel.knifeRound') : t('demoRadar.panel.round', { label: round.label });
});

const message = computed(() => {
    const value = mapMessage.value;

    if (!value) {
        return '';
    }

    if (value.key === 'noImage') {
        return [
            t('demoRadar.map.noImage', { name: value.name || '?' }),
            value.game === 'cod2' ? t('demoRadar.map.cod2Hint') : '',
            value.game === 'cod1' ? t('demoRadar.map.cod1Hint') : '',
            t('demoRadar.map.dropHint'),
        ].filter(Boolean).join(' ');
    }

    return t('demoRadar.map.' + value.key, { name: value.name || '?', error: value.error || '' });
});

onMounted(() => {
    radar.attachCanvas('mapCanvas', canvas.value);
    window.addEventListener('pointermove', onWindowPointerMove);
    window.addEventListener('pointerup', onWindowPointerUp);
});

onBeforeUnmount(() => {
    radar.detachCanvas('mapCanvas');
    window.removeEventListener('pointermove', onWindowPointerMove);
    window.removeEventListener('pointerup', onWindowPointerUp);
});
</script>

<template>
    <div class="relative bg-[#07080b] select-none">
        <canvas ref="canvas"
                class="absolute inset-0 w-full h-full block touch-none"
                :class="drawMode ? 'cursor-crosshair' : dragging ? 'cursor-grabbing' : 'cursor-grab'"
                @pointerdown="onPointerDown"
                @pointerleave="radar.mapLeave"
                @wheel.prevent="onWheel"></canvas>

        <!-- HUD: score, round clock, alive counts -->
        <div v-if="panel" class="absolute left-3 bottom-3 min-w-[170px] rounded-lg bg-fps-900/90 border border-white/[0.08] px-3 py-2 text-xs pointer-events-none">
            <div class="flex items-center justify-between gap-3 font-bold">
                <span class="flex items-center gap-1.5 min-w-0">
                    <i class="w-2 h-2 rounded-full shrink-0" :style="{ background: teamColor(0) }"></i>
                    <span class="truncate max-w-[6rem] text-gray-200">{{ panel.teams[0].name }}</span>
                    <span class="tabular-nums text-white">{{ panel.score[0] }}</span>
                </span>
                <span class="text-center leading-tight">
                    <span class="block font-mono text-[0.8rem] text-white tabular-nums">{{ formatClock(panel.roundTime) }}</span>
                    <small class="block text-[0.6rem] font-medium text-gray-500">{{ roundLabel }}</small>
                </span>
                <span class="flex items-center gap-1.5 min-w-0">
                    <span class="tabular-nums text-white">{{ panel.score[1] }}</span>
                    <span class="truncate max-w-[6rem] text-gray-200">{{ panel.teams[1].name }}</span>
                    <i class="w-2 h-2 rounded-full shrink-0" :style="{ background: teamColor(1) }"></i>
                </span>
            </div>
            <div class="flex justify-between gap-4 mt-1 text-[0.65rem] text-gray-500">
                <span>{{ t('demoRadar.panel.alive', { alive: panel.teams[0].alive, total: panel.teams[0].total }) }}</span>
                <span>{{ t('demoRadar.panel.alive', { alive: panel.teams[1].alive, total: panel.teams[1].total }) }}</span>
            </div>
        </div>

        <!-- Map tools -->
        <div class="absolute right-3 top-3 flex flex-col gap-1.5">
            <button type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-md border text-xs transition-colors"
                    :class="drawMode ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-fps-900/90 border-white/[0.08] text-gray-400 hover:text-white'"
                    :title="t('demoRadar.tools.draw')"
                    @click="radar.toggleDraw">
                <i class="fas fa-pencil-alt"></i>
            </button>
            <button v-if="drawMode || hasStrokes"
                    type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-md bg-fps-900/90 border border-white/[0.08] text-xs text-gray-400 hover:text-white transition-colors"
                    :title="t('demoRadar.tools.clear')"
                    @click="radar.clearDrawings">
                <i class="fas fa-eraser"></i>
            </button>
            <button type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-md bg-fps-900/90 border border-white/[0.08] text-xs text-gray-400 hover:text-white transition-colors"
                    :title="t('demoRadar.tools.zoomIn')"
                    @click="radar.zoom(1.3)">
                <i class="fas fa-plus"></i>
            </button>
            <button type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-md bg-fps-900/90 border border-white/[0.08] text-xs text-gray-400 hover:text-white transition-colors"
                    :title="t('demoRadar.tools.zoomOut')"
                    @click="radar.zoom(1 / 1.3)">
                <i class="fas fa-minus"></i>
            </button>
            <button type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-md bg-fps-900/90 border border-white/[0.08] text-xs text-gray-400 hover:text-white transition-colors"
                    :title="t('demoRadar.tools.fit')"
                    @click="radar.fit">
                <i class="fas fa-compress-arrows-alt"></i>
            </button>
        </div>

        <!-- No map image etc. -->
        <div v-if="message" class="absolute left-3 right-14 top-3 max-w-lg rounded-lg bg-fps-900/90 border border-white/[0.08] px-3 py-2 text-[0.7rem] text-gray-400 pointer-events-none">
            {{ message }}
        </div>

        <!-- Hover tooltip -->
        <div v-if="tooltip"
             class="absolute z-10 rounded-md bg-fps-900/95 border border-white/[0.1] px-2 py-1 text-[0.7rem] text-gray-300 whitespace-nowrap pointer-events-none"
             :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
            <b :style="{ color: teamColor(tooltip.squad) }">{{ tooltip.name }}</b>
            <template v-if="tooltip.weapon"> · {{ tooltip.weapon }}</template>
            <template v-if="tooltip.hp !== null"> · {{ tooltip.hp }} {{ t('demoRadar.panel.hp') }}</template>
        </div>
    </div>
</template>

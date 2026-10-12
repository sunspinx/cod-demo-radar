<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import { formatClock } from '../../demo-radar/format';
import { teamColor } from '../../demo-radar/renderer';
import DemoRadarHeatMenu from './DemoRadarHeatMenu.vue';
import DemoRadarLayersMenu from './DemoRadarLayersMenu.vue';

const { t } = useI18n();
const radar = useDemoRadar();
const { panel, tooltip, mapMessage, drawMode, hasStrokes, killFeed } = radar;

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

const reasonText = (why) => {
    if (!why) {
        return '';
    }

    return why.key ? t('demoRadar.reasons.' + why.key) : why.text;
};

const roundResult = computed(() => {
    const value = panel.value;

    if (!value || value.status !== 'won') {
        return '';
    }

    const won = t('demoRadar.panel.wonBy', { team: value.winnerName });
    const reason = reasonText(value.round.why);

    return reason ? `${won} - ${reason}` : won;
});

const KILL_FEED_SIZE = 6;

const recentKills = computed(() => (panel.value?.roundKills || []).slice(-KILL_FEED_SIZE));

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

        <!-- HUD: teams and score, round clock, one figure per player (dimmed once dead) -->
        <div v-if="panel" class="absolute left-1/2 top-3 -translate-x-1/2 max-w-[calc(100%-6rem)] rounded-lg bg-[#111827]/90 backdrop-blur-sm shadow-lg border border-white/[0.08] px-4 py-2 text-xs pointer-events-none">
            <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-x-3">
                <span class="flex items-center justify-end gap-1.5 min-w-0 font-bold">
                    <i class="w-2 h-2 rounded-full shrink-0" :style="{ background: teamColor(0) }"></i>
                    <span class="truncate text-gray-200">{{ panel.teams[0].name }}</span>
                </span>
                <span class="flex items-center justify-center gap-2 font-bold tabular-nums">
                    <span class="text-sm text-white">{{ panel.score[0] }}</span>
                    <span class="text-[0.6rem] font-semibold uppercase text-gray-500">{{ t('demoRadar.panel.versus') }}</span>
                    <span class="text-sm text-white">{{ panel.score[1] }}</span>
                </span>
                <span class="flex items-center gap-1.5 min-w-0 font-bold">
                    <span class="truncate text-gray-200">{{ panel.teams[1].name }}</span>
                    <i class="w-2 h-2 rounded-full shrink-0" :style="{ background: teamColor(1) }"></i>
                </span>

                <span v-if="panel.status === 'stratTime'" class="col-start-2 mt-0.5 whitespace-nowrap text-center text-xs font-bold uppercase leading-tight tracking-wider text-amber-300">{{ t('demoRadar.panel.stratTime') }}</span>
                <span v-else class="col-start-2 mt-0.5 text-center font-mono text-sm leading-tight text-white tabular-nums">{{ formatClock(panel.roundTime) }}</span>
                <small class="col-start-2 text-center text-[0.6rem] font-medium leading-tight text-gray-500">{{ roundLabel }}</small>
                <small v-if="roundResult" class="col-start-1 col-end-4 mt-0.5 truncate text-center text-[0.6rem] font-semibold leading-tight text-gray-300">{{ roundResult }}</small>

                <span v-for="team in panel.teams"
                      :key="team.squad"
                      class="mt-1.5 flex gap-1"
                      :class="team.squad === 0 ? 'col-start-1 justify-end' : 'col-start-3 justify-start'"
                      :aria-label="t('demoRadar.panel.alive', { alive: team.alive, total: team.total })">
                    <button v-for="player in team.players"
                            :key="player.cn"
                            type="button"
                            class="pointer-events-auto text-[0.8rem] leading-none transition-[color,opacity] duration-300"
                            :class="player.alive ? '' : 'opacity-25 grayscale'"
                            :style="{ color: player.alive ? teamColor(team.squad) : '#6b7280' }"
                            :title="player.name"
                            @click="radar.selectPlayer(radar.selected.value === player.cn ? -1 : player.cn)">
                        <i class="fas fa-user" :class="player.selected ? 'drop-shadow-[0_0_3px_rgba(255,255,255,0.9)]' : ''"></i>
                    </button>
                </span>
            </div>
        </div>

        <!-- Kill feed of the current round -->
        <div v-if="panel && killFeed && recentKills.length"
             class="absolute right-3 bottom-3 flex max-w-[60%] flex-col items-end gap-1 text-[0.7rem]"
             :aria-label="t('demoRadar.panel.killsThisRound')">
            <button v-for="kill in recentKills"
                    :key="kill.t + kill.victim.name"
                    type="button"
                    class="flex max-w-full items-center gap-1.5 rounded-md bg-[#111827]/85 backdrop-blur-sm border border-white/[0.06] px-2 py-1 hover:border-white/20 transition-colors"
                    @click="radar.seekToKill(kill.t)">
                <span class="font-mono text-[0.6rem] text-gray-500 tabular-nums shrink-0">{{ formatClock(kill.time) }}</span>
                <span v-if="kill.attacker" class="truncate font-semibold" :style="{ color: teamColor(kill.attacker.squad) }">{{ kill.attacker.name }}</span>
                <span class="shrink-0 text-[0.65rem] text-gray-400">
                    {{ kill.weapon }}
                    <span v-if="kill.headshot" class="ml-0.5 px-1 rounded bg-red-500/15 text-[0.55rem] font-bold text-red-400">{{ t('demoRadar.panel.hs') }}</span>
                </span>
                <span class="truncate font-semibold" :style="{ color: teamColor(kill.victim.squad) }">{{ kill.victim.name }}</span>
            </button>
        </div>

        <!-- Map tools -->
        <div class="absolute right-3 top-3 flex flex-col gap-1.5">
            <button type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-md border text-xs transition-colors"
                    :class="drawMode ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-[#111827]/90 border-white/[0.08] text-gray-400 hover:text-white'"
                    :title="t('demoRadar.tools.draw')"
                    @click="radar.toggleDraw">
                <i class="fas fa-pencil-alt"></i>
            </button>
            <button v-if="drawMode || hasStrokes"
                    type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-md bg-[#111827]/90 border border-white/[0.08] text-xs text-gray-400 hover:text-white transition-colors"
                    :title="t('demoRadar.tools.clear')"
                    @click="radar.clearDrawings">
                <i class="fas fa-eraser"></i>
            </button>
            <button type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-md bg-[#111827]/90 border border-white/[0.08] text-xs text-gray-400 hover:text-white transition-colors"
                    :title="t('demoRadar.tools.zoomIn')"
                    @click="radar.zoom(1.3)">
                <i class="fas fa-plus"></i>
            </button>
            <button type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-md bg-[#111827]/90 border border-white/[0.08] text-xs text-gray-400 hover:text-white transition-colors"
                    :title="t('demoRadar.tools.zoomOut')"
                    @click="radar.zoom(1 / 1.3)">
                <i class="fas fa-minus"></i>
            </button>
            <button type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-md bg-[#111827]/90 border border-white/[0.08] text-xs text-gray-400 hover:text-white transition-colors"
                    :title="t('demoRadar.tools.fit')"
                    @click="radar.fit">
                <i class="fas fa-compress-arrows-alt"></i>
            </button>
            <DemoRadarLayersMenu />
            <DemoRadarHeatMenu />
        </div>

        <!-- No map image etc. -->
        <div v-if="message" class="absolute left-3 bottom-3 max-w-[38%] rounded-lg bg-[#111827]/90 border border-white/[0.08] px-3 py-2 text-[0.7rem] text-gray-400 pointer-events-none">
            {{ message }}
        </div>

        <!-- Hover tooltip -->
        <div v-if="tooltip"
             class="absolute z-10 rounded-md bg-[#111827]/95 border border-white/[0.1] px-2 py-1 text-[0.7rem] text-gray-300 whitespace-nowrap pointer-events-none"
             :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }">
            <b :style="{ color: teamColor(tooltip.squad) }">{{ tooltip.name }}</b>
            <template v-if="tooltip.weapon"> · {{ tooltip.weapon }}</template>
            <template v-if="tooltip.hp !== null"> · {{ tooltip.hp }} {{ t('demoRadar.panel.hp') }}</template>
        </div>
    </div>
</template>

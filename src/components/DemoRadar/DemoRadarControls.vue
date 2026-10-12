<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import { formatClock } from '../../demo-radar/format';
import { LANES } from '../../demo-radar/renderer';
import DemoRadarHeatMenu from './DemoRadarHeatMenu.vue';
import DemoRadarLayersMenu from './DemoRadarLayersMenu.vue';

const { t } = useI18n();
const radar = useDemoRadar();
const { match, playing, speed, range, time, showGrenades, sidePanel, lanes, counts, SPEEDS } = radar;

const timeline = ref(null);
let seeking = false;

const LANE_ICONS = {
    rounds: 'fa-flag',
    kills: 'fa-crosshairs',
    grenades: 'fa-bomb',
    smokes: 'fa-cloud',
    bomb: 'fa-dot-circle',
};

const duration = computed(() => match.value.t1 - match.value.t0);

const rangeOptions = computed(() => match.value.rounds.map((round, index) => {
    const name = round.knife ? t('demoRadar.panel.knifeRound') : t('demoRadar.panel.round', { label: round.label });

    return {
        index,
        label: round.winnerSquad >= 0 ? `${name} - ${match.value.squads[round.winnerSquad].name}` : name,
    };
}));

const seekFromEvent = (event) => {
    const rect = timeline.value.getBoundingClientRect();
    radar.timelineSeek(event.clientX - rect.left, rect.width);
};

const onTimelineDown = (event) => {
    seeking = true;
    seekFromEvent(event);
};

const onWindowMove = (event) => {
    if (seeking) {
        seekFromEvent(event);
    }
};

const onWindowUp = () => {
    seeking = false;
};

onMounted(() => {
    radar.attachCanvas('timelineCanvas', timeline.value);
    window.addEventListener('pointermove', onWindowMove);
    window.addEventListener('pointerup', onWindowUp);
});

onBeforeUnmount(() => {
    radar.detachCanvas('timelineCanvas');
    window.removeEventListener('pointermove', onWindowMove);
    window.removeEventListener('pointerup', onWindowUp);
});
</script>

<template>
    <div class="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 sm:px-4 py-3">
        <div class="flex flex-wrap items-center gap-2">
            <!-- Transport -->
            <div class="flex items-center gap-1">
                <button type="button"
                        class="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                        :title="t('demoRadar.controls.previousRound')"
                        @click="radar.jumpRound(-1)">
                    <i class="fas fa-step-backward text-xs"></i>
                </button>
                <button type="button"
                        class="w-10 h-10 flex items-center justify-center rounded-full bg-[#28a5c0] text-white hover:bg-[#2fb8d5] transition-colors"
                        :title="t('demoRadar.controls.play')"
                        @click="radar.togglePlay">
                    <i class="fas text-sm" :class="playing ? 'fa-pause' : 'fa-play ml-0.5'"></i>
                </button>
                <button type="button"
                        class="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                        :title="t('demoRadar.controls.nextRound')"
                        @click="radar.jumpRound(1)">
                    <i class="fas fa-step-forward text-xs"></i>
                </button>
            </div>

            <span class="font-mono text-xs text-gray-500 tabular-nums">
                <b class="text-gray-200">{{ formatClock(time) }}</b> / {{ formatClock(duration) }}
            </span>

            <!-- Speed -->
            <div class="inline-flex items-center gap-0.5 bg-white/[0.03] border border-white/[0.08] rounded-md p-0.5">
                <button v-for="value in SPEEDS"
                        :key="value"
                        type="button"
                        class="px-2 py-1 rounded text-[0.65rem] font-semibold transition-colors"
                        :class="speed === value ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'"
                        @click="speed = value">
                    {{ value }}x
                </button>
            </div>

            <!-- Range -->
            <select class="h-8 max-w-[13rem] bg-white/[0.04] border border-white/[0.08] rounded-md px-2 text-xs text-gray-200 focus:outline-none focus:border-gray-500"
                    :title="t('demoRadar.controls.range')"
                    :value="range"
                    @change="radar.setRange(Number($event.target.value))">
                <option :value="-1">{{ t('demoRadar.controls.entireMatch') }}</option>
                <option v-for="option in rangeOptions" :key="option.index" :value="option.index">{{ option.label }}</option>
            </select>

            <div class="flex flex-wrap items-center gap-2 sm:ml-auto">
                <DemoRadarHeatMenu />
                <DemoRadarLayersMenu />
                <button type="button"
                        class="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-semibold transition-colors"
                        :class="showGrenades ? 'bg-[#28a5c0]/15 border-[#28a5c0]/40 text-[#28a5c0]' : 'bg-white/[0.03] border-white/[0.08] text-gray-400 hover:text-white'"
                        :title="t('demoRadar.controls.grenadesTitle')"
                        @click="radar.toggleGrenades">
                    <i class="fas fa-bomb"></i> {{ t('demoRadar.controls.grenades') }}
                </button>
                <button type="button"
                        class="w-8 h-8 flex items-center justify-center rounded-md border text-xs transition-colors"
                        :class="sidePanel ? 'bg-white/[0.06] border-white/[0.12] text-gray-200' : 'bg-white/[0.03] border-white/[0.08] text-gray-500 hover:text-white'"
                        :title="t('demoRadar.controls.sidePanel')"
                        @click="radar.toggleSidePanel">
                    <i class="fas fa-columns"></i>
                </button>
            </div>
        </div>

        <!-- Lane toggles -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-3 text-[0.7rem] text-gray-400">
            <span class="text-[0.6rem] font-bold uppercase tracking-widest text-gray-600">{{ t('demoRadar.controls.lanes') }}</span>
            <label v-for="lane in LANES" :key="lane" class="inline-flex items-center gap-1.5 cursor-pointer hover:text-white">
                <input type="checkbox" class="accent-[#28a5c0]" :checked="lanes[lane]" @change="radar.toggleLane(lane)">
                <i class="fas text-[0.6rem] text-gray-500" :class="LANE_ICONS[lane]"></i>
                {{ t('demoRadar.lanes.' + lane) }}
                <i class="not-italic text-gray-600 tabular-nums">{{ counts[lane] }}</i>
            </label>
            <span class="hidden md:inline ml-auto text-[0.65rem] text-gray-600">{{ t('demoRadar.controls.hint') }}</span>
        </div>

        <canvas ref="timeline"
                class="block w-full h-[116px] mt-2 cursor-pointer touch-none"
                @pointerdown="onTimelineDown"></canvas>
    </div>
</template>

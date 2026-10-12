<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import { formatClock } from '../../demo-radar/format';

const { t } = useI18n();
const radar = useDemoRadar();
const { match, playing, speed, range, time, fullscreen, SPEEDS } = radar;

const emit = defineEmits(['fullscreen']);

/** Skip step of the back / forward buttons (same as the arrow keys). */
const SKIP_MS = 5000;

const BUTTON = 'w-7 sm:w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors';

const timeline = ref(null);
let seeking = false;

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
    <div class="bg-[#0d1117]">
        <!-- Timeline = scrubber -->
        <div class="px-3 sm:px-4 pt-3">
            <canvas ref="timeline"
                    class="block w-full h-[116px] cursor-pointer touch-none"
                    :title="t('demoRadar.controls.hint')"
                    @pointerdown="onTimelineDown"></canvas>
        </div>

        <!-- Player bar -->
        <div class="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-2 px-3 sm:px-4 py-2.5">
            <div class="flex items-center gap-0.5">
                <button type="button" :class="BUTTON" :title="t('demoRadar.controls.previousRound')" @click="radar.jumpRound(-1)">
                    <i class="fas fa-step-backward text-xs"></i>
                </button>
                <button type="button" :class="BUTTON" :title="t('demoRadar.controls.back')" @click="radar.seek(time - SKIP_MS)">
                    <i class="fas fa-backward text-xs"></i>
                </button>
                <button type="button"
                        class="mx-1 w-10 h-10 flex items-center justify-center rounded-full bg-[#28a5c0] text-white hover:bg-[#2fb8d5] transition-colors"
                        :title="t('demoRadar.controls.play')"
                        @click="radar.togglePlay">
                    <i class="fas text-sm" :class="playing ? 'fa-pause' : 'fa-play ml-0.5'"></i>
                </button>
                <button type="button" :class="BUTTON" :title="t('demoRadar.controls.forward')" @click="radar.seek(time + SKIP_MS)">
                    <i class="fas fa-forward text-xs"></i>
                </button>
                <button type="button" :class="BUTTON" :title="t('demoRadar.controls.nextRound')" @click="radar.jumpRound(1)">
                    <i class="fas fa-step-forward text-xs"></i>
                </button>
            </div>

            <span class="font-mono text-xs text-gray-500 tabular-nums">
                <b class="text-gray-200">{{ formatClock(time) }}</b> / {{ formatClock(duration) }}
            </span>

            <div class="order-last sm:order-none flex flex-wrap items-center gap-2 sm:ml-auto">
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

            </div>

            <!-- Fullscreen: end of the first line on phones, far right on wider screens -->
            <button type="button" class="ml-auto sm:ml-0 sm:order-last" :class="BUTTON" :title="t('demoRadar.controls.fullscreen')" @click="emit('fullscreen')">
                <i class="fas" :class="fullscreen ? 'fa-compress' : 'fa-expand'"></i>
            </button>
        </div>
    </div>
</template>

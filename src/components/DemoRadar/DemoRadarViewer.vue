<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import DemoRadarMap from './DemoRadarMap.vue';
import DemoRadarSidePanel from './DemoRadarSidePanel.vue';
import DemoRadarControls from './DemoRadarControls.vue';
import DemoRadarStats from './DemoRadarStats.vue';
import DemoRadarPlayerPopover from './DemoRadarPlayerPopover.vue';

const { t } = useI18n();
const { match, sidePanel, fullscreen, closeMatch, toggleFullscreen } = useDemoRadar();

const root = ref(null);

const modLabel = computed(() => {
    const meta = match.value.meta;

    return meta.modLabel || (meta.mod ? meta.mod.replace(/^mods\//, '') : t('demoRadar.stock'));
});

const title = computed(() => {
    const meta = match.value.meta;

    return [meta.matchTitle || meta.hostname, meta.file, meta.startDate].filter(Boolean).join(' · ');
});
</script>

<template>
    <div ref="root" class="space-y-3" :class="fullscreen ? 'bg-fps-900 p-3 sm:p-4 overflow-y-auto' : ''">
        <!-- Match line -->
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
            <button type="button"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-200 border border-white/[0.06] hover:border-white/20 transition-colors"
                    @click="closeMatch">
                <i class="fas fa-chevron-left text-[0.6rem]"></i> {{ t('demoRadar.back') }}
            </button>
            <span class="text-base font-bold text-white">{{ match.meta.map || t('demoRadar.unknownMap') }}</span>
            <span class="px-1.5 py-0.5 rounded bg-white/[0.06] text-[0.6rem] font-semibold uppercase tracking-wider text-gray-400">{{ match.meta.gameLabel || 'CoD4' }} · {{ match.meta.gametype || '?' }}</span>
            <span class="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[0.6rem] font-semibold uppercase tracking-wider text-amber-400">{{ t('demoRadar.local') }} · {{ modLabel }}</span>
            <span class="text-xs text-gray-500 truncate min-w-0">{{ title }}</span>
            <button type="button"
                    class="ml-auto w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
                    :title="t('demoRadar.controls.fullscreen')"
                    @click="toggleFullscreen(root)">
                <i class="fas" :class="fullscreen ? 'fa-compress' : 'fa-expand'"></i>
            </button>
        </div>

        <!-- Map + side panel -->
        <div class="flex flex-col lg:flex-row rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden"
             :class="fullscreen ? 'lg:h-[calc(100vh-15rem)]' : 'lg:h-[min(72vh,640px)] lg:min-h-[440px]'">
            <DemoRadarMap class="h-[62vh] lg:h-auto lg:flex-1 min-w-0" />
            <DemoRadarSidePanel v-if="sidePanel" class="lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.06]" />
        </div>

        <DemoRadarControls />
        <DemoRadarStats />
        <DemoRadarPlayerPopover />
    </div>
</template>

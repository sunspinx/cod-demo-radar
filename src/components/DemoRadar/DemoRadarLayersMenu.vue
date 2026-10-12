<script setup>
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import DemoRadarDropdown from './DemoRadarDropdown.vue';

const { t } = useI18n();
const radar = useDemoRadar();
const { layers, showGrenades, killFeed } = radar;
</script>

<template>
    <DemoRadarDropdown variant="icon" :title="t('demoRadar.controls.layers')">
        <template #button>
            <i class="fas fa-layer-group"></i>
        </template>

        <div class="mb-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-gray-500">{{ t('demoRadar.layers.title') }}</div>
        <label class="flex items-center gap-2 py-0.5 cursor-pointer hover:text-white">
            <input type="checkbox" class="accent-[#28a5c0]" :checked="layers.trails" @change="radar.toggleLayer('trails')">
            {{ t('demoRadar.layers.trails') }}
        </label>
        <label class="flex items-center gap-2 py-0.5 cursor-pointer hover:text-white">
            <input type="checkbox" class="accent-[#28a5c0]" :checked="showGrenades" @change="radar.toggleGrenades()">
            {{ t('demoRadar.layers.grenades') }}
            <kbd class="ml-auto px-1 rounded bg-white/[0.06] text-[0.6rem] text-gray-500">G</kbd>
        </label>
        <label class="flex items-center gap-2 py-0.5 cursor-pointer hover:text-white">
            <input type="checkbox" class="accent-[#28a5c0]" :checked="killFeed" @change="radar.toggleKillFeed()">
            {{ t('demoRadar.layers.killFeed') }}
        </label>
    </DemoRadarDropdown>
</template>

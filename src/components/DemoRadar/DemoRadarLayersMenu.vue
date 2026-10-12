<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import DemoRadarDropdown from './DemoRadarDropdown.vue';

const { t } = useI18n();
const radar = useDemoRadar();
const { layers, orient } = radar;

const LAYERS = ['names', 'cones', 'trails', 'shots', 'killLines', 'deaths', 'bomb', 'mapImage'];
const ORIENTATIONS = ['auto', '0', '90', '180', '270'];

const imageInput = ref(null);

const onImageChange = () => {
    const file = imageInput.value.files[0];

    if (file) {
        radar.loadMapImageFile(file);
    }

    imageInput.value.value = '';
};
</script>

<template>
    <DemoRadarDropdown>
        <template #button>
            <i class="fas fa-layer-group"></i> {{ t('demoRadar.controls.layers') }}
        </template>

        <div class="mb-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-gray-500">{{ t('demoRadar.layers.title') }}</div>
        <label v-for="layer in LAYERS" :key="layer" class="flex items-center gap-2 py-0.5 cursor-pointer hover:text-white">
            <input type="checkbox" class="accent-[#28a5c0]" :checked="layers[layer]" @change="radar.toggleLayer(layer)">
            {{ t('demoRadar.layers.' + layer) }}
        </label>

        <div class="mt-3 mb-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-gray-500">{{ t('demoRadar.layers.imageTitle') }}</div>
        <button type="button"
                class="w-full px-2.5 py-1.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-left text-gray-300 hover:text-white hover:border-white/20 transition-colors"
                @click="imageInput.click()">
            <i class="fas fa-image mr-1.5 text-gray-500"></i>{{ t('demoRadar.layers.loadImage') }}
        </button>
        <input ref="imageInput" type="file" accept=".png,.jpg,.jpeg,.webp,.iwi" class="hidden" @change="onImageChange">
        <label class="flex items-center justify-between gap-2 mt-2">
            {{ t('demoRadar.layers.orientation') }}
            <select class="bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1 text-xs text-gray-200 focus:outline-none focus:border-gray-500"
                    :value="orient"
                    @change="radar.setOrient($event.target.value)">
                <option v-for="value in ORIENTATIONS" :key="value" :value="value">{{ value === 'auto' ? t('demoRadar.layers.auto') : value + '°' }}</option>
            </select>
        </label>
    </DemoRadarDropdown>
</template>

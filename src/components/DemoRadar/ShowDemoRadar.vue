<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { provideDemoRadar } from '../../composables/useDemoRadar';
import DemoRadarLibrary from './DemoRadarLibrary.vue';
import DemoRadarViewer from './DemoRadarViewer.vue';

const { t, locale } = useI18n();
const radar = provideDemoRadar();

const laneLabels = computed(() => Object.fromEntries(
    ['rounds', 'kills', 'grenades', 'smokes', 'bomb'].map((lane) => [lane, t('demoRadar.lanes.' + lane)]),
));

const preventDefault = (event) => event.preventDefault();

const onDocumentDrop = (event) => {
    event.preventDefault();

    if (event.dataTransfer?.files?.length) {
        radar.dropFiles(event.dataTransfer.files);
    }
};

watch(locale, () => radar.setLaneLabels(laneLabels.value));

onMounted(() => {
    document.addEventListener('dragover', preventDefault);
    document.addEventListener('drop', onDocumentDrop);
    radar.start(laneLabels.value);
});

onBeforeUnmount(() => {
    document.removeEventListener('dragover', preventDefault);
    document.removeEventListener('drop', onDocumentDrop);
    radar.stop();
});
</script>

<template>
    <div class="demo-radar pt-8 pb-12">
        <!-- Header -->
        <div class="mb-6">
            <a href="/tools" class="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-gray-500 hover:text-gray-300 transition-colors mb-1.5">
                <span aria-hidden="true">&larr;</span> {{ t('demoRadar.backToTools') }}
            </a>
            <h1 class="flex items-center gap-3 text-2xl sm:text-3xl font-black tracking-tight text-white leading-tight">
                <i class="fas fa-satellite-dish text-[#28a5c0] text-xl sm:text-2xl"></i>
                {{ t('demoRadar.title') }}
            </h1>
            <p class="mt-1 text-sm text-gray-400">{{ t('demoRadar.subtitle') }}</p>
            <p class="mt-1 text-xs text-gray-500 max-w-3xl">{{ t('demoRadar.intro') }}</p>
        </div>

        <DemoRadarViewer v-if="radar.match.value" />
        <DemoRadarLibrary v-else />

        <a href="https://github.com/sunspinx/cod-demo-radar" target="_blank" rel="noopener"
           class="mt-6 inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors">
            <i class="fab fa-github" aria-hidden="true"></i> {{ t('demoRadar.sourceCode') }}
        </a>
    </div>
</template>


<style>
/* forms.scss hides every checkbox/radio off-screen and draws a fake box on a `+ label` sibling; the radar wraps its inputs in the label instead, so it shows the inputs again and themes Flowbite's checkbox/radio for the dark radar. */
.demo-radar {
    color-scheme: dark;
}

.demo-radar input[type="checkbox"],
.demo-radar input[type="radio"] {
    position: static;
    left: auto;
    width: 0.875rem;
    height: 0.875rem;
    flex-shrink: 0;
    cursor: pointer;
    background-color: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.25);
}

.demo-radar input[type="checkbox"] {
    border-radius: 0.2rem;
}

.demo-radar input[type="checkbox"]:checked,
.demo-radar input[type="radio"]:checked {
    background-color: #28a5c0;
    border-color: #28a5c0;
}

.demo-radar input[type="checkbox"]:focus,
.demo-radar input[type="radio"]:focus {
    box-shadow: none;
    outline: none;
}

.demo-radar input[type="checkbox"]:focus-visible,
.demo-radar input[type="radio"]:focus-visible {
    outline: 2px solid rgba(40, 165, 192, 0.6);
    outline-offset: 1px;
}

.demo-radar select option {
    background-color: #111827;
    color: #e5e7eb;
}
</style>

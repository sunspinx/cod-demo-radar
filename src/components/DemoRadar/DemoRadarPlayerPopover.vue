<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import { teamColor } from '../../demo-radar/renderer';

const { t } = useI18n();
const radar = useDemoRadar();
const { popover } = radar;

const element = ref(null);
const position = ref({ left: 0, top: 0 });

const HEATS = [
    { type: 'presence', label: 'positionHeat' },
    { type: 'kills', label: 'killHeat' },
    { type: 'deaths', label: 'deathHeat' },
];

const rows = computed(() => {
    const p = popover.value;

    return [
        [t('demoRadar.popover.kills'), p.kills],
        [t('demoRadar.popover.deaths'), p.deaths],
        [t('demoRadar.popover.kd'), p.kd],
        [t('demoRadar.popover.headshots'), `${p.headshots} (${p.headshotPercent}%)`],
        [t('demoRadar.popover.grenades'), `${p.frags} / ${p.flashes} / ${p.smokes}`],
        ...(p.shots ? [[t('demoRadar.popover.shots'), p.shots]] : []),
    ];
});

// keep the card on screen: open to the left of the click, clamp to the viewport
watch(popover, async (value) => {
    if (!value) {
        return;
    }

    position.value = { left: Math.max(8, Math.min(window.innerWidth - 300, value.x - 290)), top: value.y };
    await nextTick();
    const height = element.value?.offsetHeight || 0;
    position.value = { ...position.value, top: Math.max(8, Math.min(window.innerHeight - height - 10, value.y)) };
});

const onDocumentClick = (event) => {
    if (popover.value && element.value && !element.value.contains(event.target)) {
        popover.value = null;
    }
};

onMounted(() => document.addEventListener('click', onDocumentClick, true));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick, true));
</script>

<template>
    <div v-if="popover"
         ref="element"
         class="fixed z-50 w-[280px] rounded-xl bg-[#111827] border border-white/[0.1] shadow-2xl p-4 text-xs text-gray-300"
         :style="{ left: position.left + 'px', top: position.top + 'px' }">
        <div class="flex items-center justify-between gap-2 mb-3">
            <h4 class="flex items-center gap-2 text-sm font-bold text-white min-w-0">
                <i class="w-2 h-2 rounded-full shrink-0" :style="{ background: teamColor(popover.squad) }"></i>
                <span class="truncate">{{ popover.name }}</span>
            </h4>
            <button type="button"
                    class="w-6 h-6 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-white/[0.06] transition-colors"
                    @click="popover = null">
                <i class="fas fa-times text-[0.65rem]"></i>
            </button>
        </div>

        <dl class="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            <template v-for="[label, value] in rows" :key="label">
                <dt class="text-gray-500">{{ label }}</dt>
                <dd class="text-right font-semibold tabular-nums text-gray-200">{{ value }}</dd>
            </template>
        </dl>

        <div v-if="popover.weapons.length" class="mt-3 pt-3 border-t border-white/[0.06] space-y-0.5">
            <div v-for="weapon in popover.weapons" :key="weapon.name" class="flex justify-between gap-2">
                <span class="truncate text-gray-400">{{ weapon.name }}</span>
                <span class="tabular-nums text-gray-200">{{ weapon.count }}</span>
            </div>
        </div>

        <div class="flex flex-wrap gap-1.5 mt-3">
            <button v-for="heatOption in HEATS"
                    :key="heatOption.type"
                    type="button"
                    class="px-2.5 py-1 rounded-md bg-[#28a5c0]/10 border border-[#28a5c0]/30 text-[0.65rem] font-semibold text-[#28a5c0] hover:bg-[#28a5c0]/20 transition-colors"
                    @click="radar.heatForPlayer(popover.cn, heatOption.type)">
                {{ t('demoRadar.popover.' + heatOption.label) }}
            </button>
        </div>
    </div>
</template>

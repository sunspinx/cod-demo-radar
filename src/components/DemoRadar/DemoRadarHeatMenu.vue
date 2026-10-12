<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import { HEAT_TYPES } from '../../demo-radar/heat';
import DemoRadarDropdown from './DemoRadarDropdown.vue';

const { t } = useI18n();
const radar = useDemoRadar();
const { heat, match } = radar;

const label = computed(() => (heat.type === 'off' ? t('demoRadar.heat.button') : t('demoRadar.heat.short.' + heat.type)));

const players = computed(() => match.value.players.filter((p) => p.squad >= 0));

const teams = computed(() => [
    { value: 'all', label: t('demoRadar.heat.bothTeams') },
    { value: '0', label: match.value.squads[0].name },
    { value: '1', label: match.value.squads[1].name },
]);

const sides = computed(() => [
    { value: 'all', label: t('demoRadar.heat.bothSides') },
    { value: 'att', label: t('demoRadar.heat.attackOnly') },
    { value: 'def', label: t('demoRadar.heat.defenceOnly') },
]);
</script>

<template>
    <DemoRadarDropdown variant="icon" :active="heat.type !== 'off'" :title="label">
        <template #button>
            <i class="fas fa-fire"></i>
        </template>

        <div class="mb-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-gray-500">{{ t('demoRadar.heat.title') }}</div>
        <label v-for="type in HEAT_TYPES" :key="type" class="flex items-center gap-2 py-0.5 cursor-pointer hover:text-white">
            <input type="radio" name="demo-radar-heat" class="accent-[#28a5c0]" :checked="heat.type === type" @change="radar.setHeat(type)">
            {{ t('demoRadar.heat.' + type) }}
        </label>

        <div class="mt-3 mb-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-gray-500">{{ t('demoRadar.heat.team') }}</div>
        <label v-for="team in teams" :key="team.value" class="flex items-center gap-2 py-0.5 cursor-pointer hover:text-white">
            <input type="radio" name="demo-radar-heat-team" class="accent-[#28a5c0]" :checked="heat.team === team.value" @change="radar.updateHeat({ team: team.value })">
            <span class="truncate">{{ team.label }}</span>
        </label>

        <div class="mt-3 mb-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-gray-500">{{ t('demoRadar.heat.side') }}</div>
        <label v-for="side in sides" :key="side.value" class="flex items-center gap-2 py-0.5 cursor-pointer hover:text-white">
            <input type="radio" name="demo-radar-heat-side" class="accent-[#28a5c0]" :checked="heat.side === side.value" @change="radar.updateHeat({ side: side.value })">
            {{ side.label }}
        </label>

        <div class="mt-3 mb-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-gray-500">{{ t('demoRadar.heat.player') }}</div>
        <select class="w-full bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-gray-500"
                :value="heat.player"
                @change="radar.updateHeat({ player: Number($event.target.value) })">
            <option :value="-1">{{ t('demoRadar.heat.allPlayers') }}</option>
            <option v-for="player in players" :key="player.cn" :value="player.cn">{{ player.name }}</option>
        </select>

        <div class="mt-3 mb-1.5 text-[0.6rem] font-bold uppercase tracking-widest text-gray-500">{{ t('demoRadar.heat.look') }}</div>
        <label class="flex items-center justify-between gap-2 py-0.5">
            {{ t('demoRadar.heat.radius') }}
            <input type="range" min="4" max="40" class="w-32 accent-[#28a5c0]" :value="heat.radius" @input="radar.updateHeat({ radius: Number($event.target.value) })">
        </label>
        <label class="flex items-center justify-between gap-2 py-0.5">
            {{ t('demoRadar.heat.intensity') }}
            <input type="range" min="1" max="40" class="w-32 accent-[#28a5c0]" :value="heat.gain" @input="radar.updateHeat({ gain: Number($event.target.value) })">
        </label>
        <label class="flex items-center gap-2 py-0.5 mt-1 cursor-pointer hover:text-white">
            <input type="checkbox" class="accent-[#28a5c0]" :checked="heat.players" @change="radar.updateHeat({ players: $event.target.checked })">
            {{ t('demoRadar.heat.keepPlayers') }}
        </label>
    </DemoRadarDropdown>
</template>

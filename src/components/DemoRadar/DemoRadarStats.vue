<script setup>
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import { teamColor } from '../../demo-radar/renderer';

const { t } = useI18n();
const radar = useDemoRadar();
const { stats } = radar;

const COLUMNS = ['k', 'd', 'diff', 'kd', 'hs', 'entry', 'nades'];
</script>

<template>
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div v-for="team in stats" :key="team.squad" class="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
            <h3 class="flex items-center gap-2 px-4 py-3 border-b border-white/[0.04] text-sm font-bold">
                <span class="w-2 h-2 rounded-full" :style="{ background: teamColor(team.squad) }"></span>
                <span :style="{ color: teamColor(team.squad) }">{{ team.name }}</span>
                <span class="text-xs font-medium text-gray-500">{{ t('demoRadar.stats.roundsWon', { count: team.wins }) }}</span>
            </h3>
            <div class="overflow-x-auto">
                <table class="w-full text-xs">
                    <thead>
                        <tr class="text-gray-400 uppercase tracking-wider text-[0.65rem]">
                            <th class="px-4 py-2 text-left bg-white/[0.03] border-b border-white/[0.06]">{{ t('demoRadar.stats.player') }}</th>
                            <th v-for="column in COLUMNS" :key="column" class="px-3 py-2 text-center bg-white/[0.03] border-b border-white/[0.06]">{{ t('demoRadar.stats.' + column) }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in team.rows"
                            :key="row.cn"
                            class="border-b border-white/[0.03] last:border-0 cursor-pointer hover:bg-white/[0.03] transition-colors"
                            @click="radar.openPopover(row.cn, $event.clientX, $event.clientY)">
                            <td class="px-4 py-2 font-semibold text-gray-200 truncate max-w-[12rem]">{{ row.name }}</td>
                            <td class="px-3 py-2 text-center tabular-nums text-gray-200">{{ row.kills }}</td>
                            <td class="px-3 py-2 text-center tabular-nums text-gray-400">{{ row.deaths }}</td>
                            <td class="px-3 py-2 text-center tabular-nums" :class="row.diff > 0 ? 'text-emerald-400' : row.diff < 0 ? 'text-red-400' : 'text-gray-500'">{{ row.diff > 0 ? '+' : '' }}{{ row.diff }}</td>
                            <td class="px-3 py-2 text-center tabular-nums text-gray-300">{{ row.kd }}</td>
                            <td class="px-3 py-2 text-center tabular-nums text-gray-400">{{ row.headshotPercent }}%</td>
                            <td class="px-3 py-2 text-center tabular-nums text-gray-400">{{ row.entries }}</td>
                            <td class="px-3 py-2 text-center tabular-nums text-gray-400">{{ row.grenades }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    </div>
</template>

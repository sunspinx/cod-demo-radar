<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import { formatClock } from '../../demo-radar/format';
import { teamColor } from '../../demo-radar/renderer';

const { t } = useI18n();
const radar = useDemoRadar();
const { panel } = radar;

const roundTitle = computed(() => {
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

const status = computed(() => {
    const value = panel.value;

    if (!value) {
        return '';
    }

    if (value.status === 'won') {
        const reason = reasonText(value.round.why);
        const won = t('demoRadar.panel.wonBy', { team: value.winnerName });

        return reason ? `${won} - ${reason}` : won;
    }

    return t('demoRadar.panel.' + value.status);
});

const toggleSelect = (cn) => radar.selectPlayer(radar.selected.value === cn ? -1 : cn);

const hpWidth = (hp) => (hp === null ? 100 : Math.max(0, Math.min(100, hp)));
</script>

<template>
    <aside v-if="panel" class="bg-[#0d1117] px-3 py-3 overflow-y-auto text-xs max-h-[70vh] lg:max-h-none">
        <!-- Round header -->
        <div class="flex items-start justify-between gap-2 px-1 pb-2">
            <div>
                <div class="text-[0.7rem] font-bold uppercase tracking-widest text-gray-300">{{ roundTitle }}</div>
                <div class="text-[0.7rem] text-gray-500 mt-0.5">{{ status }}</div>
            </div>
            <button type="button"
                    class="w-6 h-6 flex items-center justify-center rounded text-gray-600 hover:text-white hover:bg-white/[0.06] transition-colors"
                    :title="t('demoRadar.panel.hidePanel')"
                    @click="radar.toggleSidePanel">
                <i class="fas fa-times text-[0.65rem]"></i>
            </button>
        </div>

        <!-- Teams -->
        <div v-for="team in panel.teams" :key="team.squad" class="mt-2 rounded-lg border border-white/[0.05] bg-white/[0.02] overflow-hidden">
            <div class="flex items-center gap-1.5 px-2.5 py-2 border-b border-white/[0.04]">
                <span class="w-1 h-3.5 rounded-sm" :style="{ background: teamColor(team.squad) }"></span>
                <span class="font-bold truncate" :style="{ color: teamColor(team.squad) }">{{ team.name }}</span>
                <span class="font-bold text-white tabular-nums">{{ team.score }}</span>
                <span v-if="team.side" class="text-[0.6rem] font-medium uppercase tracking-wider text-gray-600">{{ t('demoRadar.panel.' + team.side) }}</span>
                <span class="ml-auto text-[0.65rem] text-gray-500 shrink-0">{{ t('demoRadar.panel.alive', { alive: team.alive, total: team.total }) }}</span>
            </div>
            <div class="grid grid-cols-[minmax(0,1fr)_4.5rem_1.5rem_1.5rem_1.25rem] gap-x-1 px-2.5 pt-1.5 pb-1 text-[0.6rem] font-semibold uppercase tracking-wider text-gray-600">
                <span>{{ t('demoRadar.panel.player') }}</span>
                <span>{{ t('demoRadar.panel.inHand') }}</span>
                <span class="text-right">{{ t('demoRadar.panel.k') }}</span>
                <span class="text-right">{{ t('demoRadar.panel.d') }}</span>
                <span></span>
            </div>
            <template v-for="player in team.players" :key="player.cn">
                <div class="grid grid-cols-[minmax(0,1fr)_4.5rem_1.5rem_1.5rem_1.25rem] gap-x-1 items-center px-2.5 py-1 cursor-pointer transition-colors"
                     :class="[player.selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]', player.alive ? 'text-gray-200' : 'text-gray-600']"
                     @click="toggleSelect(player.cn)">
                    <span class="flex items-center gap-1.5 min-w-0">
                        <i class="w-1.5 h-1.5 rounded-full shrink-0" :class="player.alive ? '' : 'opacity-40'" :style="{ background: teamColor(team.squad) }"></i>
                        <span class="truncate" :class="player.alive ? '' : 'line-through'">{{ player.name }}</span>
                        <span v-if="player.pov"
                              class="px-1 rounded bg-[#28a5c0]/15 text-[0.55rem] font-bold text-[#28a5c0] shrink-0"
                              :title="t('demoRadar.panel.povTitle')">{{ t('demoRadar.panel.pov') }}</span>
                    </span>
                    <span class="truncate text-[0.65rem] text-gray-500" :title="player.weapon">{{ player.weapon || '-' }}</span>
                    <span class="text-right tabular-nums">{{ player.kills }}</span>
                    <span class="text-right tabular-nums">{{ player.deaths }}</span>
                    <button type="button"
                            class="text-gray-600 hover:text-[#28a5c0] transition-colors"
                            :title="t('demoRadar.panel.stats')"
                            @click.stop="radar.openPopover(player.cn, $event.clientX, $event.clientY)">
                        <i class="fas fa-chart-bar text-[0.65rem]"></i>
                    </button>
                </div>

                <!-- Selected player: health and weapon -->
                <div v-if="player.selected" class="mx-2.5 mb-1.5 rounded-md bg-white/[0.03] px-2.5 py-2 space-y-1.5">
                    <div class="flex items-center gap-2">
                        <span class="text-[0.6rem] font-semibold text-gray-500">{{ t('demoRadar.panel.hp') }}</span>
                        <div class="flex-1 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                            <div class="h-full rounded-full" :class="player.hp === null ? 'bg-gray-700' : 'bg-emerald-500'" :style="{ width: hpWidth(player.hp) + '%' }"></div>
                        </div>
                        <b class="tabular-nums text-gray-200">{{ player.hp === null ? '?' : player.hp }}</b>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="px-1.5 py-0.5 rounded bg-white/[0.06] text-[0.65rem] text-gray-300">{{ player.weapon || '-' }}</span>
                        <span v-if="player.clip !== null" class="text-[0.65rem] tabular-nums text-gray-400">{{ player.clip }} / {{ player.ammo }}</span>
                    </div>
                    <p v-if="player.hp === null" class="text-[0.6rem] text-gray-600">{{ t('demoRadar.panel.hpOnlyPov') }}</p>
                </div>
            </template>
        </div>

        <!-- Kill feed -->
        <div class="mt-3 px-1 text-[0.6rem] font-bold uppercase tracking-widest text-gray-500">{{ t('demoRadar.panel.killsThisRound') }}</div>
        <div class="mt-1.5 space-y-0.5">
            <div v-for="kill in panel.roundKills"
                 :key="kill.t + kill.victim.name"
                 class="flex items-center gap-1.5 px-1.5 py-1 rounded cursor-pointer hover:bg-white/[0.04] transition-colors"
                 @click="radar.seekToKill(kill.t)">
                <span class="font-mono text-[0.6rem] text-gray-600 tabular-nums shrink-0">{{ formatClock(kill.time) }}</span>
                <span v-if="kill.attacker" class="truncate font-semibold" :style="{ color: teamColor(kill.attacker.squad) }">{{ kill.attacker.name }}</span>
                <span class="shrink-0 text-[0.65rem] text-gray-500">
                    {{ kill.weapon }}
                    <span v-if="kill.headshot" class="ml-0.5 px-1 rounded bg-red-500/15 text-[0.55rem] font-bold text-red-400">{{ t('demoRadar.panel.hs') }}</span>
                </span>
                <span class="truncate font-semibold" :style="{ color: teamColor(kill.victim.squad) }">{{ kill.victim.name }}</span>
            </div>
            <p v-if="!panel.roundKills.length" class="px-1.5 py-1 text-gray-600">{{ t('demoRadar.panel.none') }}</p>
        </div>
    </aside>
</template>

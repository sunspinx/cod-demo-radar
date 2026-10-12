<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useDemoRadar } from '../../composables/useDemoRadar';
import { formatClock } from '../../demo-radar/format';
import { teamColor } from '../../demo-radar/renderer';

const { t } = useI18n();
const { library, loading, loadFiles, openMatch, removeFromLibrary } = useDemoRadar();

const fileInput = ref(null);
const dragging = ref(false);

const onFileChange = () => {
    loadFiles([...fileInput.value.files]);
    fileInput.value.value = '';
};

/** The page-level drop handler (ShowDemoRadar) loads the files; this only resets the highlight. */
const onDrop = () => {
    dragging.value = false;
};
</script>

<template>
    <div class="space-y-6">
        <!-- Drop zone -->
        <label class="relative flex flex-col items-center justify-center gap-2 px-6 py-14 rounded-xl border-2 border-dashed cursor-pointer text-center transition-colors"
               :class="dragging ? 'border-[#28a5c0] bg-[#28a5c0]/[0.06]' : 'border-white/[0.1] bg-white/[0.02] hover:border-white/[0.2] hover:bg-white/[0.03]'"
               @dragenter.prevent="dragging = true"
               @dragover.prevent="dragging = true"
               @dragleave.prevent="dragging = false"
               @drop="onDrop">
            <input ref="fileInput" type="file" accept=".dm_1,.dm_2,.dm_3,.dm_4,.dm_5,.dm_6" multiple class="hidden" @change="onFileChange">
            <div class="w-12 h-12 rounded-xl bg-[#28a5c0]/10 flex items-center justify-center mb-1">
                <i class="fas fa-file-upload text-xl text-[#28a5c0]"></i>
            </div>
            <p class="text-sm font-semibold text-gray-200">
                {{ t('demoRadar.drop.title') }} <span class="text-[#28a5c0] underline underline-offset-2">{{ t('demoRadar.drop.browse') }}</span>
            </p>
            <p class="text-xs text-gray-500">{{ t('demoRadar.drop.hint') }}</p>
            <p class="text-[0.7rem] text-gray-600"><i class="fas fa-lock mr-1"></i>{{ t('demoRadar.drop.local') }}</p>

            <!-- Progress -->
            <div v-if="loading.active || loading.error" class="w-full max-w-md mt-4" @click.prevent>
                <div class="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div class="h-full transition-[width] duration-150"
                         :class="loading.error ? 'bg-red-500' : 'bg-[#28a5c0]'"
                         :style="{ width: (loading.error ? 100 : Math.round(loading.progress * 100)) + '%' }"></div>
                </div>
                <p class="mt-2 text-xs" :class="loading.error ? 'text-red-400' : 'text-gray-400'">
                    <template v-if="loading.error">{{ t('demoRadar.drop.' + loading.error, { file: loading.file }) }}</template>
                    <template v-else>{{ t('demoRadar.drop.parsing', { file: loading.file, percent: Math.round(loading.progress * 100) }) }}</template>
                </p>
            </div>
        </label>

        <!-- Loaded demos -->
        <div v-if="library.length" class="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
            <div class="px-5 py-3 border-b border-white/[0.04] text-[0.65rem] font-semibold uppercase tracking-widest text-gray-500">
                {{ t('demoRadar.library.title') }}
            </div>
            <div class="divide-y divide-white/[0.04]">
                <div v-for="(item, index) in library"
                     :key="index"
                     class="group flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-5 py-3 cursor-pointer hover:bg-white/[0.03] transition-colors"
                     @click="openMatch(item)">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="text-sm font-semibold text-gray-200 group-hover:text-[#28a5c0] transition-colors">{{ item.meta.map || t('demoRadar.unknownMap') }}</span>
                            <span class="px-1.5 py-0.5 rounded bg-white/[0.06] text-[0.6rem] font-semibold uppercase tracking-wider text-gray-400">{{ item.meta.gameLabel }} · {{ item.meta.gametype || '?' }}</span>
                        </div>
                        <p class="text-xs text-gray-500 truncate mt-0.5">
                            {{ item.meta.file }} · {{ formatClock(item.t1 - item.t0) }} · {{ t('demoRadar.library.rounds', { count: item.rounds.length }) }} · {{ t('demoRadar.library.kills', { count: item.kills.length }) }}
                        </p>
                    </div>
                    <div class="flex items-center gap-3 shrink-0">
                        <span class="text-sm font-bold tabular-nums">
                            <span :style="{ color: teamColor(0) }">{{ item.squads[0].name }} {{ item.squads[0].wins }}</span>
                            <span class="text-gray-600 mx-1">:</span>
                            <span :style="{ color: teamColor(1) }">{{ item.squads[1].wins }} {{ item.squads[1].name }}</span>
                        </span>
                        <button type="button"
                                class="w-7 h-7 flex items-center justify-center rounded-md text-gray-600 hover:text-red-400 hover:bg-white/[0.06] transition-colors"
                                :title="t('demoRadar.library.remove')"
                                @click.stop="removeFromLibrary(item)">
                            <i class="fas fa-times text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

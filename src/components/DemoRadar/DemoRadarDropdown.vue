<script setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';

defineProps({
    active: { type: Boolean, default: false },
    // 'button' = labelled button opening upwards; 'icon' = square map tool opening to the left
    variant: { type: String, default: 'button' },
    title: { type: String, default: '' },
});

const open = ref(false);
const root = ref(null);

const onDocumentClick = (event) => {
    if (open.value && root.value && !root.value.contains(event.target)) {
        open.value = false;
    }
};

onMounted(() => document.addEventListener('click', onDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', onDocumentClick));
</script>

<template>
    <div ref="root" class="relative">
        <button v-if="variant === 'icon'"
                type="button"
                class="w-8 h-8 flex items-center justify-center rounded-md border text-xs transition-colors"
                :class="active || open ? 'bg-[#28a5c0]/20 border-[#28a5c0]/40 text-[#28a5c0]' : 'bg-[#111827]/90 border-white/[0.08] text-gray-400 hover:text-white'"
                :title="title"
                :aria-expanded="open"
                @click="open = !open">
            <slot name="button" />
        </button>
        <button v-else
                type="button"
                class="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs font-semibold transition-colors"
                :class="active || open ? 'bg-[#28a5c0]/15 border-[#28a5c0]/40 text-[#28a5c0]' : 'bg-white/[0.03] border-white/[0.08] text-gray-300 hover:text-white hover:border-white/20'"
                :title="title"
                @click="open = !open">
            <slot name="button" />
            <i class="fas fa-chevron-down text-[0.55rem] opacity-60"></i>
        </button>
        <div v-if="open"
             class="absolute z-30 w-64 overflow-y-auto rounded-lg bg-[#111827] border border-white/[0.1] shadow-2xl p-3 text-xs text-gray-300"
             :class="variant === 'icon' ? 'right-full top-0 mr-2 max-h-[22rem]' : 'right-0 bottom-full mb-2 max-h-[60vh]'">
            <slot />
        </div>
    </div>
</template>

// Demo Radar entry point. Built as its own bundle (AGPL-3.0, https://github.com/sunspinx/cod-demo-radar)
// and mounted on its own element, separate from the site's Vue app.
import { createApp } from 'vue';
import ShowDemoRadar from './components/DemoRadar/ShowDemoRadar.vue';
import { createDemoRadarI18n, pageLocale } from './demo-radar/i18n/index.js';

const element = document.getElementById('demo-radar');

if (element) {
    const i18n = createDemoRadarI18n();

    createApp(ShowDemoRadar).use(i18n).mount(element);

    new MutationObserver(() => {
        i18n.global.locale.value = pageLocale();
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
}

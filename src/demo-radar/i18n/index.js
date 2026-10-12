import { createI18n } from 'vue-i18n';
import ar from './ar.js';
import cs from './cs.js';
import en from './en.js';
import es from './es.js';
import he from './he.js';
import hr from './hr.js';
import hu from './hu.js';
import pl from './pl.js';
import pt from './pt.js';
import ru from './ru.js';

export const messages = { ar, cs, en, es, he, hr, hu, pl, pt, ru };

/** Locale from the host page (`<html lang>`), falling back to English. */
export const pageLocale = () => {
    const lang = (document.documentElement.lang || 'en').toLowerCase().split('-')[0];

    return messages[lang] ? lang : 'en';
};

export const createDemoRadarI18n = () => createI18n({
    legacy: false,
    locale: pageLocale(),
    fallbackLocale: 'en',
    messages,
});

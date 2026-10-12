# cod-demo-radar

Browser-based 2D replay, kill feed and heatmaps for Call of Duty 1 (1.5), Call of Duty 2 (CoD2x / zPAM)
and Call of Duty 4 (CoD4X) `.dm_1` demos. Demos are parsed in the browser and never uploaded.

Used on [fpschallenge.eu](https://fpschallenge.eu/tools/demo-radar). This repository holds the exact
source of the Demo Radar that runs there.

## Features

- CoD4 / CoD4X, CoD2 (protocol 115-119) and CoD1 1.5 demo parsing, entirely client-side
- 2D replay with player positions, view directions, grenades, smokes and bomb events
- Kill feed, round timeline with event lanes, per-round scoreboard and player stats
- Heatmaps (positions, kills, deaths, ...)
- UI in 10 languages (`src/i18n`)

## Layout

```
src/
  demo-radar/        parsers (CoD4, CoD2/CoD1), demo -> match model, renderer, heatmaps
  components/        Vue 3 components (entry: DemoRadar/ShowDemoRadar.vue)
  composables/       useDemoRadar.js - state and playback loop
  i18n/              demoRadar strings per locale (vue-i18n)
  index.js           exports
tests/               node:test suite
```

## Usage

Requirements: Vue 3, vue-i18n 9, Tailwind CSS 3 (the components use Tailwind classes; scan
`src/**/*.{js,vue}` in your `content` config, and define `.bg-fps-900 { background: #111827; }`).

```js
import { createApp } from 'vue';
import { createI18n } from 'vue-i18n';
import { ShowDemoRadar } from 'cod-demo-radar';
import en from 'cod-demo-radar/src/i18n/en.js';

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } });

createApp(ShowDemoRadar).use(i18n).mount('#app');
```

Parsing without the UI:

```js
import { buildMatch, prepareMatch } from 'cod-demo-radar';

const match = prepareMatch(await buildMatch(new Uint8Array(buffer), 'demo.dm_1'));
```

### Map images

Map images are game assets and are **not** included. The radar loads them from
`MAP_IMAGE_BASE` (`/images/demo-radar/`): CoD4 compass minimaps as `<map>.webp`, CoD2 radars as
`cod2/radar_<map>.webp`, CoD1 radars as `cod1/<map>.png` (calibration in `src/demo-radar/maps.js`).
Without an image, a map falls back to a movement-density background.

## Tests

Requires Node 22.

```sh
npm test
# parser tests run when demo files are provided:
DEMO_RADAR_COD4_DEMO=path/to/cod4.dm_1 \
DEMO_RADAR_COD2_DEMO=path/to/cod2.dm_1 \
DEMO_RADAR_COD1_DEMO=path/to/cod1.dm_1 \
DEMO_RADAR_IMAGES=path/to/images/demo-radar \
npm test
```

## License

Copyright (C) 2026 SOLUQA Technology s.r.o.

This program is free software: you can redistribute it and/or modify it under the terms of the
GNU Affero General Public License as published by the Free Software Foundation, version 3.
It is distributed WITHOUT ANY WARRANTY. See [`LICENSE`](LICENSE).

The demo parsers are ports of [Iswenzz/CoD4-DM1](https://github.com/Iswenzz/CoD4-DM1) (GPL-3.0) and
[voron00/CoD2rev_Server](https://github.com/voron00/CoD2rev_Server) (AGPL-3.0), which build on
id Software's Quake III Arena and CoD4x Server. See [`NOTICE.md`](NOTICE.md) for details and changes.

Call of Duty is a trademark of Activision Publishing, Inc. This project is not affiliated with or
endorsed by Activision.

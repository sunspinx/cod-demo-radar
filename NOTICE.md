# Notices and third-party code

cod-demo-radar is Copyright (C) 2026 SOLUQA Technology s.r.o. and licensed under the GNU Affero General Public License v3.0 (see `LICENSE`).

The demo parsers are JavaScript ports of the following projects. Porting C/C++ code to JavaScript
creates a derivative work, so their licenses apply to these files and to the program as a whole.

| Files | Ported from | License |
|---|---|---|
| `src/demo-radar/parser.js`, `src/demo-radar/tables.js` | [Iswenzz/CoD4-DM1](https://github.com/Iswenzz/CoD4-DM1) - CoD4 / CoD4X `.dm_1` reader (demo reader, message reading, Huffman tree, netfield tables) | GPL-3.0 (`LICENSES/GPL-3.0.txt`) |
| `src/demo-radar/parser_cod2.js`, `src/demo-radar/tables_cod2.js` | [voron00/CoD2rev_Server](https://github.com/voron00/CoD2rev_Server) - reverse-engineered CoD2 server (message reading, Huffman tree, netfield tables) | AGPL-3.0 (`LICENSES/AGPL-3.0.txt`) |

Both upstream projects build on code from:

- [id Software - Quake III Arena](https://github.com/id-Software/Quake-III-Arena) (GPL-2.0-or-later): bit-level message format and Huffman compression.
- [callofduty4x/CoD4x_Server](https://github.com/callofduty4x/CoD4x_Server) (AGPL-3.0): CoD4 message and netfield code.

GPL-2.0-or-later and GPL-3.0 code may be combined with AGPL-3.0 code (GPLv3 section 13);
the combined program is distributed under the AGPL-3.0.

## Changes made

Changes relative to the upstream projects (GPLv3 / AGPLv3 section 5a):

- 2026-10: Rewritten in JavaScript to run in the browser. Read-only: only demo parsing is kept
  (no writing, no networking, no server code). Netfield tables and Huffman frequencies are
  emitted as generated JavaScript data (`tables*.js`).
- 2026-10: CoD1 (1.5) support added to the CoD2 parser (Quake 3 command numbers, own netfield
  tables in `tables_cod1.js`, generated from the CoD1 dedicated server binary).

## Original code

Everything else (`src/demo-radar/extract.js`, `match.js`, `renderer.js`, `heat.js`, `iwi.js`,
`maps.js`, `format.js`, `tables_cod1.js`, `src/components`, `src/composables`, `src/i18n`, `tests`)
was written for [FPSChallenge](https://fpschallenge.eu) and is released under the AGPL-3.0 as part of this program.

## Trademarks and game assets

Call of Duty is a trademark of Activision Publishing, Inc. This project is not affiliated with or
endorsed by Activision. No game files or map images are included in this repository.

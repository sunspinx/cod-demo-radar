// Map images for the Demo Radar (public/images/demo-radar). Generated from the viewer's maps/index.js
// (tools/extract-maps.js there dumps them from the game archives).

/** CoD4 compass minimaps; the demo carries the minimap material and its world corners, so no calibration is needed. */
export const COD4_MINIMAPS = new Set([
    'compass_map_mp_4hanoi',
    'compass_map_mp_4t4dawnville',
    'compass_map_mp_backlot',
    'compass_map_mp_bakaara',
    'compass_map_mp_bloc',
    'compass_map_mp_bog',
    'compass_map_mp_breakout',
    'compass_map_mp_broadcast',
    'compass_map_mp_carentan',
    'compass_map_mp_carentan44',
    'compass_map_mp_cargoship',
    'compass_map_mp_cellblock',
    'compass_map_mp_citystreets',
    'compass_map_mp_cluster',
    'compass_map_mp_coastal',
    'compass_map_mp_convoy',
    'compass_map_mp_countdown',
    'compass_map_mp_crash',
    'compass_map_mp_crash_snow',
    'compass_map_mp_creek',
    'compass_map_mp_crossfire',
    'compass_map_mp_dawnville',
    'compass_map_mp_derail_desert',
    'compass_map_mp_dusk',
    'compass_map_mp_facility',
    'compass_map_mp_farm',
    'compass_map_mp_favela',
    'compass_map_mp_firestation',
    'compass_map_mp_firingrange',
    'compass_map_mp_forest',
    'compass_map_mp_hk2',
    'compass_map_mp_invasion',
    'compass_map_mp_killhouse',
    'compass_map_mp_manorhouse',
    'compass_map_mp_mansion',
    'compass_map_mp_matmata',
    'compass_map_mp_overgrown',
    'compass_map_mp_palace',
    'compass_map_mp_pipeline',
    'compass_map_mp_rooftops',
    'compass_map_mp_shantytown',
    'compass_map_mp_shipment',
    'compass_map_mp_showdown',
    'compass_map_mp_strike',
    'compass_map_mp_suburbs',
    'compass_map_mp_test',
    'compass_map_mp_trainstation',
    'compass_map_mp_trainyard',
    'compass_map_mp_vacant',
    'mp_mw3_alpha_compass'
]);

/** CoD2 zPAM radars: image + calibration from zPAM's maps/mp/*.radar files (u = (x * scale + ox) / 100). */
export const COD2_RADARS = {
    mp_burgundy: {
        img: 'radar_mp_burgundy',
        scale: 0.024,
        ox: 40.3,
        oy: -22,
        rot: 0
    },
    mp_burgundy_fix: {
        img: 'radar_mp_burgundy',
        scale: 0.024,
        ox: 40.3,
        oy: -22,
        rot: 0
    },
    mp_carentan: {
        img: 'radar_mp_carentan',
        scale: 0.01818,
        ox: 41.22,
        oy: -26.47,
        rot: 0
    },
    mp_carentan_fix: {
        img: 'radar_mp_carentan',
        scale: 0.01818,
        ox: 41.22,
        oy: -26.47,
        rot: 0
    },
    mp_dawnville: {
        img: 'radar_mp_dawnville',
        scale: 0.02028,
        ox: 38.08,
        oy: -383.8,
        rot: 0
    },
    mp_dawnville_fix: {
        img: 'radar_mp_dawnville',
        scale: 0.02028,
        ox: 38.08,
        oy: -383.8,
        rot: 0
    },
    mp_matmata: {
        img: 'radar_mp_matmata',
        scale: 0.0213,
        ox: -37.91,
        oy: 83.45,
        rot: -90
    },
    mp_matmata_fix: {
        img: 'radar_mp_matmata',
        scale: 0.0213,
        ox: -37.91,
        oy: 83.45,
        rot: -90
    },
    mp_railyard_mjr: {
        img: 'radar_mp_railyard_mjr',
        scale: 0.0199,
        ox: 70.99,
        oy: -40.21,
        rot: 180
    },
    mp_toujane: {
        img: 'radar_mp_toujane',
        scale: 0.0225,
        ox: 16.2,
        oy: -14.1,
        rot: -90
    },
    mp_toujane_fix: {
        img: 'radar_mp_toujane',
        scale: 0.0225,
        ox: 16.2,
        oy: -14.1,
        rot: -90
    },
    mp_breakout_tls: {
        img: 'radar_mp_breakout_tls',
        scale: 0.0217,
        ox: -55.14,
        oy: 58.12,
        rot: -90
    },
    mp_leningrad_mjr: {
        img: 'radar_mp_leningrad_mjr',
        scale: 0.0242,
        ox: 55.27,
        oy: -45.48,
        rot: -90
    },
    mp_trainstation: {
        img: 'radar_mp_trainstation',
        scale: 0.0169,
        ox: -51.89,
        oy: -105.27,
        rot: -90
    },
    mp_trainstation_fix: {
        img: 'radar_mp_trainstation',
        scale: 0.0169,
        ox: -51.89,
        oy: -105.27,
        rot: -90
    },
    mp_vallente_fix: {
        img: 'radar_mp_vallente',
        scale: 0.02,
        ox: 55.61,
        oy: -43.56,
        rot: 0
    }
};

/**
 * CoD1 radars rendered from the map geometry (the viewer's tools/render-maps-cod1.js), so the calibration is exact:
 * u = (x - x0) / span, v = (y1 - y) / span. Image: cod1/<map>.png.
 */
export const COD1_MAPS = {
    mp_aim_a: { x0: -1676, y1: 1052, span: 3356 },
    mp_aim_b: { x0: -1676, y1: 1052, span: 3356 },
    mp_aim_r: { x0: -1676, y1: 1052, span: 3356 },
    mp_beauville: { x0: -3444, y1: 360, span: 5740 },
    mp_blaoaim_a: { x0: 684, y1: 1880, span: 1708 },
    mp_blaoaim_b: { x0: 684, y1: 1880, span: 1708 },
    mp_blaoaim_r: { x0: 684, y1: 1880, span: 1708 },
    mp_bocage: { x0: -7467, y1: 12429, span: 13986 },
    mp_brecourt: { x0: -4372, y1: 4488, span: 9882 },
    mp_burgundy: { x0: -1716, y1: 3236, span: 4168 },
    mp_carentan: { x0: -2410, y1: 4024, span: 5456 },
    mp_chateau: { x0: -1343, y1: 2837, span: 3648 },
    mp_dawnville: { x0: -2868, y1: -14036, span: 5940 },
    mp_dawnville_gg: { x0: -1852, y1: -13984, span: 4924 },
    mp_dawnville_x: { x0: -2868, y1: -14036, span: 5940 },
    mp_depot: { x0: -3802, y1: 2768, span: 5100 },
    mp_germantown: { x0: -470, y1: 536, span: 4080 },
    mp_hanoi: { x0: 20, y1: -158, span: 4824 },
    mp_harbor: { x0: -11928, y1: -4297, span: 6300 },
    mp_hurtgen: { x0: -5268, y1: 5656, span: 12828 },
    mp_kandanos: { x0: -2526, y1: 3444, span: 5832 },
    mp_neuville: { x0: -16828, y1: 6018, span: 5044 },
    mp_pavlov: { x0: -11924, y1: 13072, span: 5612 },
    mp_pegasusday: { x0: -1940, y1: 1848, span: 5372 },
    mp_pegasusnight: { x0: -3261, y1: 6962, span: 11611 },
    mp_pgaim_a: { x0: -980, y1: 726, span: 1964 },
    mp_pgaim_r: { x0: -980, y1: 726, span: 1964 },
    mp_powcamp: { x0: -3638, y1: 5484, span: 7100 },
    mp_railyard: { x0: -3706, y1: 3444, span: 5000 },
    mp_railyard_x: { x0: -3706, y1: 3444, span: 5000 },
    mp_rocket: { x0: 5100, y1: 8468, span: 9332 },
    mp_ship: { x0: -434, y1: 4871, span: 9614 },
    mp_stalingrad: { x0: 1604, y1: 1042, span: 3536 },
    mp_tigertown: { x0: -3668, y1: 1176, span: 5500 },
    mp_toujane: { x0: -446, y1: 3508, span: 3756 },
    mp_wawa_a: { x0: -84, y1: 88, span: 1420 },
    mp_wawa_b: { x0: -84, y1: 88, span: 1420 },
    mp_wawa_r: { x0: -84, y1: 88, span: 1420 }
};

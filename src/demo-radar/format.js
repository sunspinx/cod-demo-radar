// Demo Radar - small pure helpers shared by the UI (no DOM, testable with node --test).

const WEAPON_NAMES = {
    ak47: 'AK-47', ak74u: 'AK-74u', m4: 'M4A1', m16: 'M16A4', g3: 'G3', g36c: 'G36C', m14: 'M14', mp44: 'MP44',
    mp5: 'MP5', uzi: 'Mini-Uzi', p90: 'P90', skorpion: 'Skorpion', rpd: 'RPD', saw: 'M249', m60e4: 'M60E4',
    m40a3: 'M40A3', remington700: 'R700', dragunov: 'Dragunov', barrett: 'Barrett', m21: 'M21',
    m1014: 'M1014', winchester1200: 'W1200', beretta: 'M9', colt45: 'M1911', usp: 'USP .45', deserteagle: 'Desert Eagle',
    deserteaglegold: 'Gold Deagle', frag_grenade: 'Frag', frag_grenade_short: 'Frag (cooked)', smoke_grenade: 'Smoke',
    flash_grenade: 'Flash', concussion_grenade: 'Stun', destructible_car: 'Car explosion', briefcase_bomb: 'Bomb',
    briefcase_bomb_defuse: 'Bomb', c4: 'C4', claymore: 'Claymore', rpg: 'RPG-7', knife: 'Knife', defaultweapon: 'Default',
    // CoD2
    kar98k: 'Kar98k', kar98k_sniper: 'Kar98k Scoped', g43: 'Gewehr 43', mp40: 'MP40', fg42: 'FG42', luger: 'Luger',
    m1garand: 'M1 Garand', m1carbine: 'M1A1 Carbine', thompson: 'Thompson', bar: 'BAR', springfield: 'Springfield', greasegun: 'Grease Gun',
    colt: 'Colt .45', enfield: 'Lee-Enfield', enfield_scope: 'Scoped Enfield', sten: 'Sten', bren: 'Bren', webley: 'Webley',
    mosin_nagant: 'Mosin-Nagant', mosin_nagant_sniper: 'Scoped Mosin', svt40: 'SVT-40', pps42: 'PPS-42', ppsh: 'PPSh-41', ppsh_stick30: 'PPSh (30)',
    tt30: 'TT-33', shotgun: 'Trench Gun', binoculars: 'Binoculars', '30cal_stand': '.30 cal', mg42_bipod_stand: 'MG42',
    frag_grenade_american: 'Frag', frag_grenade_british: 'Frag', frag_grenade_russian: 'Frag', frag_grenade_german: 'Frag',
    smoke_grenade_american: 'Smoke', smoke_grenade_british: 'Smoke', smoke_grenade_russian: 'Smoke', smoke_grenade_german: 'Smoke',
    // CoD1
    bar_slow: 'BAR (slow)', fg42_semi: 'FG42 (semi)', mp44_semi: 'MP44 (semi)', ppsh_semi: 'PPSh (semi)', thompson_semi: 'Thompson (semi)',
    fraggrenade: 'Frag', mk1britishfrag: 'Frag', 'rgd-33russianfrag': 'Frag', stielhandgranate: 'Frag', panzerfaust: 'Panzerfaust',
    ptrs41_antitank_rifle: 'PTRS-41', mg42_bipod_duck: 'MG42', mg42_bipod_prone: 'MG42',
};

const ATTACHMENTS = [[/_silencer$/, 'SD'], [/_reflex$/, 'RDS'], [/_acog$/, 'ACOG'], [/_grip$/, 'Grip'], [/_gl$/, 'GL']];

/** Milliseconds as m:ss (negative values clamp to 0:00). */
export const formatClock = (ms) => {
    const seconds = Math.floor(Math.max(0, ms) / 1000);

    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
};

/** First index whose value (or value[key]) is >= target in an array sorted ascending. */
export const lowerBound = (array, target, key) => {
    let low = 0;
    let high = array.length;

    while (low < high) {
        const mid = (low + high) >> 1;

        if ((key ? array[mid][key] : array[mid]) < target) {
            low = mid + 1;
        } else {
            high = mid;
        }
    }

    return low;
};

/** Human weapon name from an internal one ("ak47_acog_mp" -> "AK-47 ACOG"). */
export const weaponLabel = (name) => {
    if (!name) {
        return '';
    }

    let weapon = name.replace(/_mp$/i, '').toLowerCase();
    const attachments = [];

    for (const [pattern, label] of ATTACHMENTS) {
        if (pattern.test(weapon)) {
            attachments.push(label);
            weapon = weapon.replace(pattern, '');
        }
    }

    if (/^gl_/.test(weapon)) {
        return 'Grenade launcher';
    }

    const base = WEAPON_NAMES[weapon] || weapon.replace(/_/g, ' ').toUpperCase();

    return attachments.length ? base + ' ' + attachments.join(' ') : base;
};

/** Weapon of a kill, or its means of death when the weapon is unknown. */
export const killWeaponText = (kill) => (kill.weapon ? weaponLabel(kill.weapon) : kill.mod || '?');

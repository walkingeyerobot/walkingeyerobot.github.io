const go = new Go();
WebAssembly.instantiateStreaming(fetch('../build/gauntletpwd.wasm'), go.importObject)
    .then(obj => {
        go.run(obj.instance);
    });

// @formatter:off
const VALUES = {
    'beforeEarth': { 'warrior': [ 2000, false, false, false, false, false, false, false, false, false, false, 1034, 352, 0, 2, 0, 0, 0, 0, 0, 0, 0, false, false, false, true, false, false, false, 0, 0, 0, 0, 1, 0, 0, 0, 0, ], 'valkyrie': [ 2000, false, false, false, false, false, false, false, false, false, false, 1064, 357, 0, 0, 0, 0, 0, 2, 0, 0, 0, false, false, false, true, false, false, false, 0, 4, 90, 0, 1, 1, 0, 3, 0, ], 'wizard': [ 2000, false, false, false, false, false, false, false, false, false, false, 1048, 295, 0, 0, 0, 0, 0, 2, 0, 0, 0, false, false, false, true, false, false, false, 0, 2, 82, 0, 1, 2, 0, 0, 3, ], 'elf': [ 2000, false, false, false, false, false, false, false, false, false, false, 795, 265, 0, 0, 0, 0, 0, 2, 0, 0, 0, false, true, false, true, false, false, false, 0, 4, 79, 0, 1, 3, 0, 9, 1, ], },
    'afterEarth': { 'warrior': [ 2000, false, false, false, false, false, false, true, false, false, false, 2034, 1534, 0, 2, 0, 0, 0, 0, 0, 0, 0, false, false, false, true, false, false, false, 0, 1, 0, 0, 1, 0, 0, 0, 0, ], 'valkyrie': [ 2000, false, false, false, false, false, false, false, false, false, false, 2064, 1485, 0, 0, 0, 0, 0, 2, 0, 0, 0, false, false, false, true, false, false, false, 0, 4, 90, 0, 1, 1, 0, 3, 0, ], 'wizard': [ 2000, false, false, false, false, false, false, true, false, false, false, 2048, 1457, 0, 0, 0, 0, 0, 2, 0, 0, 0, false, false, false, true, false, false, false, 0, 3, 82, 0, 1, 2, 0, 0, 6, ], 'elf': [ 2000, false, false, false, false, false, false, true, false, false, false, 1795, 1433, 0, 0, 0, 0, 0, 2, 0, 0, 0, false, true, false, true, false, false, false, 0, 4, 79, 0, 1, 3, 0, 9, 1, ], },
    'beforeWind': { 'warrior': [ 2000, false, false, false, false, false, false, true, false, false, false, 4719, 4261, 0, 2, 0, 0, 0, 0, 0, 0, 0, false, false, false, true, false, false, false, 0, 2, 0, 0, 1, 0, 0, 0, 0, ], 'valkyrie': [ 2000, false, false, false, false, false, false, false, false, false, false, 4829, 740, 0, 0, 0, 0, 0, 7, 0, 0, 0, false, false, false, true, false, false, false, 0, 6, 133, 0, 1, 1, 0, 3, 0, ], 'wizard': [ 2000, false, false, false, false, false, false, true, false, false, false, 4811, 805, 2, 0, 0, 0, 0, 5, 0, 0, 0, false, false, false, true, false, false, false, 0, 6, 353, 0, 1, 2, 0, 3, 3, ], 'elf': [ 2000, false, false, false, false, false, false, true, false, false, false, 4650, 1110, 0, 0, 0, 0, 0, 7, 0, 0, 0, false, true, false, true, false, false, false, 0, 8, 229, 0, 1, 3, 0, 7, 1, ], },
    'afterWind': { 'warrior': [ 2000, false, false, false, false, false, false, true, false, false, true, 7219, 7217, 0, 2, 0, 0, 0, 0, 0, 0, 0, false, false, false, true, false, false, false, 0, 3, 0, 0, 1, 0, 0, 0, 0, ], 'valkyrie': [ 2000, false, false, false, false, false, false, false, false, false, false, 7329, 3588, 0, 0, 0, 0, 0, 7, 0, 0, 0, false, false, false, true, false, false, false, 0, 6, 133, 0, 1, 1, 0, 3, 0, ], 'wizard': [ 2000, false, false, false, false, false, false, true, false, false, true, 7311, 3757, 2, 0, 0, 0, 0, 5, 0, 0, 0, false, false, false, true, false, false, false, 0, 7, 353, 0, 1, 2, 0, 3, 7, ], 'elf': [ 2000, false, false, false, false, false, false, true, false, false, true, 7150, 4094, 0, 0, 0, 0, 0, 7, 0, 0, 0, false, false, false, true, false, false, false, 0, 9, 229, 0, 1, 3, 0, 7, 1, ], },
    'beforeFire': { 'warrior': [ 2000, false, false, false, false, false, false, true, false, false, true, 6993, 7737, 0, 7, 0, 0, 0, 0, 2, 0, 0, false, true, true, true, false, false, false, 2, 3, 0, 0, 1, 0, 0, 0, 0, ], 'valkyrie': [ 2600, false, false, false, false, false, false, false, false, false, false, 5196, 1499, 0, 0, 0, 3, 0, 7, 2, 0, 1, false, true, true, true, false, false, false, 2, 8, 162, 0, 1, 1, 0, 7, 0, ], 'wizard': [ 2000, false, false, false, false, false, false, true, false, false, true, 7178, 1300, 5, 0, 0, 0, 0, 7, 0, 1, 1, false, true, true, true, false, false, false, 2, 9, 567, 0, 1, 2, 0, 0, 8, ], 'elf': [ 2300, false, false, false, false, false, false, true, false, false, true, 5152, 1406, 0, 0, 0, 4, 0, 7, 2, 1, 0, false, true, true, true, false, false, false, 2, 12, 299, 0, 1, 3, 0, 7, 2, ], },
    'afterFire': { 'warrior': [ 2000, false, false, false, false, false, false, true, false, true, true, 11493, 14343, 0, 7, 0, 0, 0, 0, 2, 0, 0, false, true, true, true, false, false, false, 2, 4, 0, 0, 1, 0, 0, 0, 0, ], 'valkyrie': [ 2600, false, false, false, false, false, false, false, false, false, false, 9696, 7199, 0, 0, 0, 3, 0, 7, 2, 0, 1, false, true, true, true, false, false, false, 2, 8, 162, 0, 1, 1, 0, 7, 0, ], 'wizard': [ 2000, false, false, false, false, false, false, true, false, true, true, 11678, 7294, 5, 0, 0, 0, 0, 7, 0, 1, 1, false, false, true, true, false, false, false, 2, 11, 567, 0, 1, 2, 0, 0, 12, ], 'elf': [ 2300, false, false, false, false, false, false, true, false, false, true, 9652, 7106, 0, 0, 0, 4, 0, 7, 2, 1, 0, false, true, true, true, false, false, false, 2, 12, 299, 0, 1, 3, 0, 7, 2, ], },
    'beforeWater': { 'warrior': [ 2000, false, false, false, false, false, false, true, false, true, true, 19087, 10435, 0, 7, 7, 0, 0, 0, 2, 0, 0, false, true, true, true, false, false, false, 2, 4, 0, 0, 1, 0, 0, 0, 0, ], 'valkyrie': [ 2900, false, false, false, false, false, false, false, false, false, false, 17694, 2515, 0, 1, 0, 7, 0, 7, 2, 0, 1, false, true, true, true, false, false, false, 2, 10, 202, 0, 1, 1, 0, 7, 0, ], 'wizard': [ 2000, false, false, false, false, false, false, true, false, true, true, 19392, 2411, 7, 4, 0, 0, 0, 7, 0, 1, 1, false, false, true, true, false, false, false, 2, 13, 815, 0, 1, 2, 0, 0, 6, ], 'elf': [ 3400, false, false, false, false, false, false, true, false, false, true, 17706, 1811, 0, 0, 0, 7, 0, 7, 2, 1, 0, false, true, true, true, false, false, false, 2, 15, 389, 0, 1, 3, 0, 8, 4, ], },
    'afterWater': { 'warrior': [ 2000, false, false, false, false, false, false, true, true, true, true, 26087, 21971, 0, 7, 7, 0, 0, 0, 2, 0, 0, false, true, true, true, false, false, false, 2, 5, 0, 0, 1, 0, 0, 0, 0, ], 'valkyrie': [ 2900, false, false, false, false, false, false, false, false, false, false, 24694, 12243, 0, 1, 0, 7, 0, 7, 2, 0, 1, false, true, true, true, false, false, false, 2, 10, 202, 0, 1, 1, 0, 7, 0, ], 'wizard': [ 2000, false, false, false, false, false, false, true, true, true, true, 26392, 13059, 7, 4, 0, 0, 0, 7, 0, 1, 1, false, false, true, true, false, false, false, 2, 14, 815, 0, 1, 2, 0, 0, 11, ], 'elf': [ 3400, false, false, false, false, false, false, true, false, false, true, 24706, 11539, 0, 0, 0, 7, 0, 7, 2, 1, 0, false, true, true, true, false, false, false, 2, 15, 389, 0, 1, 3, 0, 8, 4, ], },
    'beforeCastle': { 'warrior': [ 6300, false, false, false, false, false, false, true, true, true, true, 15575, 600, 0, 7, 7, 0, 0, 0, 5, 0, 0, false, true, true, true, false, false, false, 10, 7, 3, 0, 1, 0, 0, 0, 0, ], 'valkyrie': [ 5900, false, false, false, false, false, false, false, false, false, false, 11329, 139, 0, 0, 0, 7, 0, 7, 2, 2, 3, false, true, true, true, false, false, false, 10, 13, 273, 0, 1, 1, 0, 1, 0, ], 'wizard': [ 3500, false, false, false, false, false, false, true, true, true, true, 14064, 85, 7, 7, 0, 0, 0, 7, 0, 2, 3, false, true, true, true, false, false, false, 10, 16, 1340, 0, 1, 2, 0, 0, 1, ], 'elf': [ 4600, false, false, false, false, false, false, true, false, false, true, 12662, 892, 0, 3, 0, 7, 0, 7, 3, 1, 3, false, true, true, true, false, false, false, 10, 20, 639, 0, 1, 3, 0, 7, 1, ], },
};
// @formatter:on

const inputs = Array.from(document.querySelectorAll('input'));

function encodeValues() {
    const values = inputs.map(input =>
        input.type === 'checkbox' ? input.checked : input.value);
    values.splice(35, 0, document.querySelector('select').value);
    const pwd = encode(...values);
    let output = document.querySelector('#output');
    output.innerHTML = `
        ${pwd.substring(0, 5)}
        ${pwd.substring(5, 10)}
        ${pwd.substring(10, 15)}<br/>
        ${pwd.substring(15, 20)}
        ${pwd.substring(20, 25)}
        ${pwd.substring(25, 30)}
    `;
    output.scrollIntoView({behavior: 'smooth'});
}

document.querySelector('fieldset button').addEventListener('click', encodeValues);

document.querySelectorAll('nav button').forEach(button =>
    button.addEventListener('click', (event) => {
        const character = event.target.dataset['character'];
        const state = event.target.dataset['state'];
        const values = [...VALUES[state][character]];
        values.splice(34, 1);

        const inputsToSet = [...inputs];
        inputsToSet.splice(0, 1);
        inputsToSet.forEach((input, index) => {
            if (input.type === 'checkbox') {
                input.checked = !!values[index];
            } else {
                input.value = values[index];
            }
        });
        document.querySelector('select').selectedIndex = VALUES[state][character][34];
        encodeValues();
    }));
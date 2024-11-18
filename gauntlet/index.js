const go = new Go();
WebAssembly.instantiateStreaming(fetch('gauntletpwd.wasm'), go.importObject)
.then(obj => {
    go.run(obj.instance);
});

const inputs = Array.from(document.querySelectorAll('input'));

document.querySelector('button').addEventListener('click', () => {
    const values = inputs.map(input =>
        input.type === 'checkbox' ? input.checked : input.value);
    values.splice(35, 0, document.querySelector('select').value);
    const pwd = encode(...values);
    document.querySelector('#output').innerHTML = `
        ${pwd.substring(0, 5)}
        ${pwd.substring(5,10)}
        ${pwd.substring(10,15)}<br/>
        ${pwd.substring(15,20)}
        ${pwd.substring(20,25)}
        ${pwd.substring(25,30)}
    `;
});
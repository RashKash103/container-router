;(async function () {

    Array.from(document.querySelectorAll('[data-i18n]')).forEach(node => {
        const i18n = node.dataset.i18n;
        delete node.dataset.i18n;
        const text = browser.i18n.getMessage(i18n);
        node.textContent = text;
    });
    document.title = browser.i18n.getMessage('selectTitle');

    const url = new URL(location.href).searchParams.get('go');
    if (!url || !(function () {
        try {
            new URL(url);
        } catch (e) {
            return false;
        }
        return true;
    }())) {
        const current = await browser.tabs.getCurrent();
        browser.tabs.remove(current.id);
        return;
    }
    document.getElementById('redirect-url').appendChild(document.createTextNode(url));

    const UNCONTAINED_MESSAGE_TYPE = 'open-uncontained';

    // this will store a string of keys pressed when searching for contexts to
    // switch to.
    let contextPrefix = '';

    // containers the preferences page has hidden are left out of the list
    const hiddenContainers = await (async function () {
        try {
            const stored = await browser.storage.sync.get({hiddenContainers: []});
            return new Set(stored.hiddenContainers.map(name => name + ''));
        } catch (e) {
            console.warn("Unable to load the hidden containers, showing all of them:", e);
            return new Set();
        }
    }());

    /** @type {Array<{ name: string, icon: string, iconUrl: string, color: string, colorCode: string, cookieStoreId: string }>} */
    const contexts = (await browser.contextualIdentities.query({}))
        .filter(context => !hiddenContainers.has(context.name));

    // the containers, followed by the option to open the url outside any of them
    const options = [
        ...contexts,
        {
            name: browser.i18n.getMessage('noContainer') || 'No container',
            cookieStoreId: null,
        },
    ];

    /** @type {HTMLUListElement} */
    const ul = document.getElementById('container-list');

    // given a cookieStoreId (reference to a container), create a new tab with
    // the URL, switch to it and close the temporary tab.
    const switchContainer = async function (cookieStoreId) {
        const current = await browser.tabs.getCurrent();
        const {active, index, windowId} = current;
        await browser.tabs.create({url: url + '', active, cookieStoreId, index, windowId});
        await browser.tabs.remove(current.id);
    };

    // the background script has to open this one: it records that the url was
    // chosen to load outside a container before the tab exists, so the new
    // request is not intercepted and sent back to this page.
    const openWithoutContainer = async function () {
        const response = await browser.runtime.sendMessage({
            type: UNCONTAINED_MESSAGE_TYPE,
            url: url + '',
        });
        if (!response || !response.ok) {
            throw new Error(response?.error || 'The background script did not open the tab.');
        }
    };

    const chooseOption = async function (option) {
        try {
            if (option.cookieStoreId) {
                await switchContainer(option.cookieStoreId);
            } else {
                await openWithoutContainer();
            }
        } catch (e) {
            console.error("Unable to open the page:", e);
        }
    };

    document.addEventListener('click', async event => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest('button');
        if (!button) return;
        event.stopPropagation();
        event.preventDefault();
        const option = options[Number.parseInt(button.dataset.optionIndex, 10)];
        if (!option) return;
        await chooseOption(option);
    }, true);

    const renderPrefix = function (contextPrefix) {
        let firstMatching = true;
        contextElementList.filter(li => {
            const span = li.querySelector('.container-name');
            const name = span.dataset.name;
            const button = li.querySelector('button');
            span.innerHTML = '';
            if (name.toLowerCase().startsWith(contextPrefix)) {
                if (contextPrefix.length) {
                    const prefix = document.createElement('i');
                    prefix.className = 'container-name-match';
                    prefix.textContent = name.slice(0, contextPrefix.length);
                    span.appendChild(prefix);
                }
                span.appendChild(document.createTextNode(name.slice(contextPrefix.length)));
                li.classList.add('prefix-matching');
                if (firstMatching) {
                    firstMatching = false;
                    button.focus();
                }
                button.tabIndex = 0;
            } else {
                span.appendChild(document.createTextNode(name));
                li.classList.remove('prefix-matching');
                button.tabIndex = -1;
            }
        });
    };

    // tracks keys pressed, if a single context starts with the keys pressed,
    // then use that context
    document.addEventListener('keydown', async event => {

        if (event.altKey || event.ctrlKey || event.metaKey) return;

        // update or clear the contextPrefix variable while typing
        if (event.key === 'Backspace') {
            contextPrefix = contextPrefix.slice(0, -1);
        } else if (event.key === 'Escape') {
            contextPrefix = '';
        } else if (/^[\u0020-\u00fe]$/.test(event.key)) {
            contextPrefix += event.key.toLowerCase();
        } else {
            return;
        }
        event.preventDefault();

        if (contextPrefix === '') return;

        // find out all matching options for the current prefix
        const matching = options.filter(option => option.name.toLowerCase().startsWith(contextPrefix));

        // open the tab if there is one and only one matching
        if (matching.length === 1) {
            await chooseOption(matching[0]);
        } else {
            if (matching.length === 0) {
                contextPrefix = '';
            }
            // show the current prefix and matching containers on the form
            renderPrefix(contextPrefix);
        }
    }, true);

    const contextElementList = options.map((context, index) => {
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        li.appendChild(button);

        /*
         * https://bugzilla.mozilla.org/show_bug.cgi?id=1377302
         * fill="context-fill" is not supported in non chrome codes
         * We use svg color matrix filter to color the icon correctly
         */
        /** @type {SVGSVGElement} */
        const iconSvg = context.cookieStoreId ? new DOMParser().parseFromString(`
<svg viewBox="0 0 32 32" color-interpolation-filters="sRGB" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <filter id="filter-${index}"><feColorMatrix type="matrix" values="${(function () {
            const hexColor = context.colorCode.replace(/[^0-9A-Fa-f]*/g, '');
            const rrggbb = hexColor.replace(/^(.)(.)(.)$/, '$1$1$2$2$3$3');
            const [red, green, blue] = rrggbb.split(/(?=(?:..)*$)/).map(v => Number.parseInt(v, 16) / 255);
            return `0 0 0 0 ${red} 0 0 0 0 ${green} 0 0 0 0 ${blue} 0 0 0 1 0`;
        }())}" /></filter>
  <image xlink:href="${context.iconUrl}" filter="url(#filter-${index})" width="32px" height="32px" />
</svg>
`, 'image/svg+xml').documentElement : new DOMParser().parseFromString(`
<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="3" />
  <line x1="7" y1="7" x2="25" y2="25" stroke="currentColor" stroke-width="3" />
</svg>
`, 'image/svg+xml').documentElement;
        const icon = document.createElement('span');
        icon.className = 'icon-wrap';
        icon.appendChild(iconSvg);
        button.appendChild(icon);

        const name = document.createElement('span');
        name.className = 'container-name';
        name.dataset.name = context.name;
        name.textContent = context.name;
        button.appendChild(name);

        ul.appendChild(li);
        button.dataset.optionIndex = index + '';
        if (context.cookieStoreId) {
            button.dataset.cookieStoreId = context.cookieStoreId;
        } else {
            li.classList.add('no-container');
        }
        return li;
    });
}());

;(async function () {

    let debugLogging = false;
    try {
        debugLogging = (await browser.storage.local.get({debugLogging: false})).debugLogging;
    } catch (e) {
        console.warn("Unable to load the debug logging preference:", e);
    }
    const debug = (...args) => {
        if (debugLogging) {
            console.debug(...args);
        }
    };
    browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.debugLogging) {
            debugLogging = changes.debugLogging.newValue;
        }
    });

    const URL_DISCOVERY_MESSAGE_TYPE = 'url-discovery';
    const URL_DISCOVERY_MAX_EVENTS = 200;
    let discoverySession = {
        active: false,
        startedAt: null,
        entries: [],
    };
    let nextDiscoverySequence = 1;
    let lastDiscoveryEventKey = null;

    const getDiscoverySnapshot = () => ({
        active: discoverySession.active,
        startedAt: discoverySession.startedAt,
        entries: discoverySession.entries.map(entry => ({...entry})),
    });

    const resetDiscoverySession = active => {
        discoverySession = {
            active,
            startedAt: active ? Date.now() : null,
            entries: [],
        };
        nextDiscoverySequence = 1;
        lastDiscoveryEventKey = null;
    };

    const recordDiscoveryEvent = event => {
        if (!discoverySession.active) return;

        const eventKey = [
            event.type,
            event.tabId,
            event.requestId,
            event.url,
            event.redirectUrl,
            event.statusCode,
            event.error,
        ].join('\u0000');
        if (eventKey === lastDiscoveryEventKey) return;

        lastDiscoveryEventKey = eventKey;
        discoverySession.entries.push({
            ...event,
            sequence: nextDiscoverySequence++,
            timestamp: Date.now(),
        });
        if (discoverySession.entries.length > URL_DISCOVERY_MAX_EVENTS) {
            discoverySession.entries.splice(0, discoverySession.entries.length - URL_DISCOVERY_MAX_EVENTS);
        }
    };

    browser.runtime.onMessage.addListener(message => {
        if (!message || message.type !== URL_DISCOVERY_MESSAGE_TYPE) return undefined;

        switch (message.action) {
            case 'start':
                resetDiscoverySession(true);
                break;
            case 'stop':
                discoverySession.active = false;
                break;
            case 'clear':
                resetDiscoverySession(false);
                break;
            case 'snapshot':
                break;
            default:
                return Promise.resolve({
                    ok: false,
                    error: `Unknown URL discovery action: ${message.action}`,
                });
        }

        return Promise.resolve({
            ok: true,
            session: getDiscoverySnapshot(),
        });
    });

    /*
     * Ignore any pages which were assigned in Multi-Account Containers (MAC)
     */
    const MAC_ADDON_ID = '@testpilot-containers';

    let macAddonEnabled = await (async function () {
        try {
            const macAddonInfo = await browser.management.get(MAC_ADDON_ID);
            return true;
        } catch (e) {
            return false;
        }
    }());

    const onMACAddonEnabledChange = enabled => info => {
        if (info.id !== MAC_ADDON_ID) return;
        macAddonEnabled = enabled;
    };
    browser.management.onInstalled.addListener(onMACAddonEnabledChange(true));
    browser.management.onEnabled.addListener(onMACAddonEnabledChange(true));
    browser.management.onUninstalled.addListener(onMACAddonEnabledChange(false));
    browser.management.onDisabled.addListener(onMACAddonEnabledChange(false));

    const isMACAssigned = async function (url) {
        if (!macAddonEnabled) return false;

        try {
            const assignment = await browser.runtime.sendMessage(MAC_ADDON_ID, {
                method: 'getAssignment',
                url,
            });
            return Boolean(assignment);
        } catch (e) {
            debug("Error fetching MAC assignment: ", e);
            return false;
        }
    };

    const matchesPattern = function (url, pattern) {
        try {
            return new RegExp(pattern).test(url);
        } catch (e) {
            console.warn("Ignoring invalid URL pattern:", pattern, e);
            return false;
        }
    };

    const hasURLException = async function (url) {
        // return true if multi account container is disabled
        if (!macAddonEnabled) return true;

        try {
            debug("Fetching URL exceptions: ", url);
            const {urlContainerMappings, urlExceptions} = await browser.storage.sync.get({urlContainerMappings: [], urlExceptions: []})
            debug("Loaded exceptions : ", urlExceptions);
            // Check if any exception matches this URL
            for (const exception of urlExceptions) {
                if (matchesPattern(url, exception.pattern)) {
                    debug("URL matched exception:", url, exception);
                    return true;
                }
            }
            debug("No exceptions matched for URL:", url);
            return false;
        } catch (e) {
            debug("Error fetching URL exceptions: ", e);
            // if we cannot fetch exceptions, we assume that there are no exceptions
            return false;
        }
    };

    /*
     * Containment of unmatched URLs is on by default. When the user turns it
     * off, only URLs matching a container mapping are contained and every other
     * URL loads normally instead of prompting for a container.
     */
    const shouldContainUnmatchedURL = async function (url) {
        try {
            debug("Fetching unmatched URL containment preference: ", url);
            const {containUnmatchedUrls} = await browser.storage.sync.get({containUnmatchedUrls: true});
            debug("Loaded unmatched URL containment preference: ", containUnmatchedUrls);
            return containUnmatchedUrls !== false;
        } catch (e) {
            debug("Error fetching unmatched URL containment preference: ", e);
            // if we cannot fetch the preference, we keep containing unmatched URLs
            return true;
        }
    };

    const doURLContainerMatchSwitch = async function (url, currentTab) {
        // return true if multi account container is disabled
        if (!macAddonEnabled) {
            return {continue: true};
        }

        try {
            debug("Fetching URL container mappings", url);
            const {urlContainerMappings, urlExceptions} = await browser.storage.sync.get({urlContainerMappings: [], urlExceptions: []})
            debug("Loaded url container mappings", urlContainerMappings);
            // Find the first matching mapping in order - array position determines priority
            let matchedMapping = null;
            for (const mapping of urlContainerMappings) {
                if (matchesPattern(url, mapping.pattern)) {
                    matchedMapping = mapping;
                    debug("URL matched mapping with priority:", url, mapping);
                    break;
                }
            }
            // if there are multiple matches, we will use the first one
            let containerName = matchedMapping ? matchedMapping.containerName : null;
            if (!containerName) {
                debug("No container assigned for URL: ", url);
                return {continue: true};
            }
            debug("URL has a container assigned... Trying to switch to it: ", url, containerName);
            const container = await browser.contextualIdentities.query({
                name: containerName,
            });
            if (container.length === 0) {
                debug("Container not found... Skipping switch: ", url, containerName);
                return {continue: true};
            }
            const cookieStoreId = container[0].cookieStoreId;
            if (cookieStoreId && typeof cookieStoreId === 'string') {
                debug(`Replacing tab. cookieStoreId was '${cookieStoreId}'.`);
                try {
                    debug("Checking already contained: ", url);
                    if (currentTab.cookieStoreId === cookieStoreId) {
                        debug("Already contained in same container... Returning: ", url);
                        return {void : true};
                    }
                } catch (e) {
                    /* we are not contained yet */
                    debug("Cannot find tab container...: ", e, "url: ", url);
                }
        
                const {active, index, windowId} = currentTab;
                await browser.tabs.create({url: url + '', active, cookieStoreId, index, windowId});
                debug(`Successfully replaced tab. cookieStoreId was '${cookieStoreId}'.`);
                debug(`Removing current tab. Tab ID was '${currentTab.id}'.`);
                await browser.tabs.remove(currentTab.id);
                debug(`Successfully removed current tab. Tab Id was '${currentTab.id}'.`);
                return {cancel: true};
            }
            debug(`Not replacing tab. cookieStoreId was '${cookieStoreId}'.`);
            return {continue: true};
        } catch (e) {
            debug("Not replacing tab. error was:", e);
            return {continue: true};
        }
    };

    /*
     * Check such pages and ask user to choose a container
     */
    /** @type {Map<number, { requestIds: Set<string>, urls: Set<string> }>} */
    const canceledRequests = new Map();

    const cleanCancelledRequest = tabId => {
        if (canceledRequests.has(tabId)) {
            canceledRequests.delete(tabId);
        }
    };
    browser.webRequest.onCompleted.addListener(options => {
        recordDiscoveryEvent({
            type: 'completed',
            tabId: options.tabId,
            requestId: options.requestId,
            url: options.url,
            statusCode: options.statusCode,
        });
        cleanCancelledRequest(options.tabId);
    }, {urls: ['<all_urls>'], types: ['main_frame']});

    browser.webRequest.onErrorOccurred.addListener(options => {
        recordDiscoveryEvent({
            type: 'error',
            tabId: options.tabId,
            requestId: options.requestId,
            url: options.url,
            error: options.error,
        });
        cleanCancelledRequest(options.tabId);
    }, {urls: ['<all_urls>'], types: ['main_frame']});

    browser.webRequest.onBeforeRedirect.addListener(options => {
        recordDiscoveryEvent({
            type: 'redirect',
            tabId: options.tabId,
            requestId: options.requestId,
            url: options.url,
            redirectUrl: options.redirectUrl,
            statusCode: options.statusCode,
        });
    }, {urls: ['<all_urls>'], types: ['main_frame']});

    const shouldCancelEarly = function (tab, request) {
        const tabId = tab.id;
        const {requestId, url} = request;
        if (!canceledRequests.has(tabId)) {
            canceledRequests.set(tabId, {
                requestIds: new Set([requestId]),
                urls: new Set([url]),
            });
            setTimeout(() => {
                canceledRequests.delete(tabId);
            }, 2000);
            return false;
        }
        const tabInfo = canceledRequests.get(tabId);
        const shouldCancel = tabInfo.requestIds.has(requestId) || tabInfo.urls.has(url);
        tabInfo.requestIds.add(requestId);
        tabInfo.urls.add(url);
        return shouldCancel;
    };

    browser.webRequest.onBeforeRequest.addListener(async function containTab(request) {
        recordDiscoveryEvent({
            type: 'request',
            tabId: request.tabId,
            requestId: request.requestId,
            url: request.url,
        });
        debug("Received request for: ", request.url);

        if (request.tabId === -1) {
            debug("Tab cannot be contained: ", request.url);
            return void 0;
        }

        const tab = await browser.tabs.get(request.tabId);
        if (tab.incognito) {
            debug("Incognito Tab cannot be contained: ", request.url);
            return void 0;
        }

        // check if Multi Account Container extension is enabled
        // we do not have anything to do if it is disabled.
        if (!macAddonEnabled) {
            debug("MAC is disabled... Not doing anything: ", request.url);
            return void 0;
        }
        debug("MAC is enabled... Continuing: ", request.url);

        // check if URL has exception allowed, we do not
        // try to contain it if it is allowed.
        debug("Checking if URL has exception: ", request.url);
        if (await hasURLException(request.url)) {
            debug("URL has exception... Not doing anything: ", request.url);
            return void 0;
        }
        debug("URL does not have exception... Continuing: ", request.url);

        // check if user has already cancelled this request
        if (request && shouldCancelEarly(tab, request)) {
            debug("Request is cancelled early, not doing anything: ", request.url);
            return void 0;
        }

        // check if url has a container assigned
        // we will switch to that container if it is assigned.
        // and remove the current tab.
        debug("Checking if URL has container assigned: ", request.url);
        let response = await doURLContainerMatchSwitch(request.url, tab); 
        if (response?.cancel) {
            debug("URL has container assigned... switched to it : ", request.url);
            return {cancel: true};
        }
        if (response?.void) {
            debug("URL has container assigned... already in same : ", request.url);
            return void 0;
        }

        // check if the user wants unmatched URLs contained at all. when this is
        // turned off, the mappings above are the only URLs we contain.
        debug("Checking if unmatched URLs should be contained: ", request.url);
        if (!await shouldContainUnmatchedURL(request.url)) {
            debug("Unmatched URL containment is disabled... Not doing anything: ", request.url);
            return void 0;
        }

        // check if Multi Account Container is handling this url
        // in that case we do not do anything.
        debug("Checking if MAC is handling this url: ", request.url);
        if (await isMACAssigned(request.url)) {
            debug("MAC is handling this url... Not doing anything: ", request.url);
            return void 0;
        }

        try {
            debug("Checking already contained: ", request.url);
            await browser.contextualIdentities.get(tab.cookieStoreId);
            debug("Already contained... Returning: ", request.url);
            return void 0;
        } catch (e) {
            /* we are not contained yet */
            debug("Cannot find tab container...: ", e, "url: ", request.url);
        }

        // if we are here, we need to ask user to choose a container.
        // the current tab will be removed, a new tab will be opened
        // the new tab will have the container.
        // after user selection, a new tab will be opened in the chosen container
        // with the url of the current tab.
        // no data is retained from the current tab.
        debug("Building container chooser UI: ", request.url);
        const choseUrl = new URL(browser.runtime.getURL('/togo/index.html'));
        choseUrl.searchParams.set('go', request.url);
        await browser.tabs.create({
            url: choseUrl + '',
            active: tab.active,
            index: tab.index,
            windowId: tab.windowId,
        });
        browser.tabs.remove(tab.id);

        return {cancel: true};

    }, {urls: ['<all_urls>'], types: ['main_frame']}, ['blocking']);

}());

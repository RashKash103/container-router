import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import {fileURLToPath} from 'node:url'

const backgroundPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/background/background.js',
)
const backgroundSource = fs.readFileSync(backgroundPath, 'utf8')

const listenerStub = () => ({addListener: () => {}})

/*
 * Runs the background script against a stubbed WebExtension API and returns its
 * main_frame request handler along with the tabs it opened and closed. The
 * stubs describe an enabled Multi-Account Containers addon, an uncontained
 * current tab, and a single 'Work' container.
 */
const loadBackground = async (syncStorage, {containedTab = false} = {}) => {
    const createdTabs = []
    const removedTabIds = []
    const messageListeners = []
    let handleRequest = null

    const tabCookieStoreId = containedTab ? 'firefox-container-9' : 'firefox-default'

    const browser = {
        storage: {
            local: {get: async defaults => ({...defaults})},
            sync: {
                get: async defaults => Object.fromEntries(Object.entries(defaults)
                    .map(([key, value]) => [key, key in syncStorage ? syncStorage[key] : value])),
            },
            onChanged: listenerStub(),
        },
        runtime: {
            onMessage: {addListener: listener => { messageListeners.push(listener) }},
            getURL: resource => `moz-extension://container-router${resource}`,
            // the MAC addon does not assign any of these URLs
            sendMessage: async () => null,
        },
        management: {
            get: async () => ({id: '@testpilot-containers'}),
            onInstalled: listenerStub(),
            onEnabled: listenerStub(),
            onUninstalled: listenerStub(),
            onDisabled: listenerStub(),
        },
        webRequest: {
            onCompleted: listenerStub(),
            onErrorOccurred: listenerStub(),
            onBeforeRedirect: listenerStub(),
            onBeforeRequest: {addListener: listener => { handleRequest = listener }},
        },
        tabs: {
            get: async id => ({
                id,
                incognito: false,
                active: true,
                index: 0,
                windowId: 1,
                cookieStoreId: tabCookieStoreId,
            }),
            create: async options => { createdTabs.push(options); return {id: 99} },
            remove: async id => { removedTabIds.push(id) },
            onRemoved: listenerStub(),
        },
        contextualIdentities: {
            // the default cookie store is not a container, so tabs start uncontained
            get: async id => {
                if (containedTab && id === tabCookieStoreId) return {cookieStoreId: id, name: 'Existing'}
                throw new Error(`No container for ${id}`)
            },
            query: async ({name}) => name === 'Work'
                ? [{name, cookieStoreId: 'firefox-container-1'}]
                : [],
        },
    }

    vm.runInContext(backgroundSource, vm.createContext({browser, console, setTimeout, clearTimeout, URL}))
    // let the script's top-level awaits settle before its listener is used
    await new Promise(resolve => setImmediate(resolve))
    assert.ok(handleRequest, 'the background script registered an onBeforeRequest listener')

    // delivers a runtime message the way browser.runtime.sendMessage would
    const sendMessage = async (message, sender) => {
        for (const listener of messageListeners) {
            const response = listener(message, sender)
            if (response !== undefined) return response
        }
        return undefined
    }

    return {handleRequest, createdTabs, removedTabIds, sendMessage}
}

let nextRequestId = 1
const mainFrameRequest = (url, tabId = 7) => ({tabId, requestId: `request-${nextRequestId++}`, url})

test('unmatched URLs open the container chooser by default', async () => {
    const {handleRequest, createdTabs, removedTabIds} = await loadBackground({})

    const result = await handleRequest(mainFrameRequest('https://example.com/page'))

    assert.equal(result.cancel, true)
    assert.equal(createdTabs.length, 1)
    assert.match(createdTabs[0].url, /\/togo\/index\.html\?go=/)
    assert.deepEqual(removedTabIds, [7])
})

test('unmatched URLs open the container chooser when containment is enabled', async () => {
    const {handleRequest, createdTabs} = await loadBackground({containUnmatchedUrls: true})

    const result = await handleRequest(mainFrameRequest('https://example.com/page'))

    assert.equal(result.cancel, true)
    assert.equal(createdTabs.length, 1)
})

test('unmatched URLs load normally when containment is disabled', async () => {
    const {handleRequest, createdTabs, removedTabIds} = await loadBackground({containUnmatchedUrls: false})

    const result = await handleRequest(mainFrameRequest('https://example.com/page'))

    assert.equal(result, undefined)
    assert.deepEqual(createdTabs, [])
    assert.deepEqual(removedTabIds, [])
})

test('mapped URLs still open in their container when containment is disabled', async () => {
    const {handleRequest, createdTabs, removedTabIds} = await loadBackground({
        containUnmatchedUrls: false,
        urlContainerMappings: [{id: '1', pattern: '.+work\\.example\\.com.+', containerName: 'Work'}],
    })

    const result = await handleRequest(mainFrameRequest('https://work.example.com/app'))

    assert.equal(result.cancel, true)
    assert.equal(createdTabs.length, 1)
    assert.equal(createdTabs[0].cookieStoreId, 'firefox-container-1')
    assert.deepEqual(removedTabIds, [7])
})

test('excepted URLs load normally regardless of the containment preference', async () => {
    for (const containUnmatchedUrls of [true, false]) {
        const {handleRequest, createdTabs} = await loadBackground({
            containUnmatchedUrls,
            urlExceptions: [{id: '1', pattern: '.+example\\.com.+'}],
        })

        const result = await handleRequest(mainFrameRequest('https://example.com/page'))

        assert.equal(result, undefined)
        assert.deepEqual(createdTabs, [])
    }
})

test('always-ask patterns prompt even when containment is disabled', async () => {
    const {handleRequest, createdTabs, removedTabIds} = await loadBackground({
        containUnmatchedUrls: false,
        urlAlwaysAsk: [{id: '1', pattern: '.+bank\\.example\\.com.+'}],
    })

    const result = await handleRequest(mainFrameRequest('https://bank.example.com/login'))

    assert.equal(result.cancel, true)
    assert.equal(createdTabs.length, 1)
    assert.match(createdTabs[0].url, /\/togo\/index\.html\?go=/)
    assert.deepEqual(removedTabIds, [7])
})

test('always-ask patterns override a container mapping', async () => {
    const {handleRequest, createdTabs} = await loadBackground({
        urlContainerMappings: [{id: '1', pattern: '.+example\\.com.+', containerName: 'Work'}],
        urlAlwaysAsk: [{id: '2', pattern: '.+example\\.com/settings.+'}],
    })

    const prompted = await handleRequest(mainFrameRequest('https://example.com/settings/profile'))
    assert.equal(prompted.cancel, true)
    assert.match(createdTabs[0].url, /\/togo\/index\.html\?go=/)

    const mapped = await handleRequest(mainFrameRequest('https://example.com/other'))
    assert.equal(mapped.cancel, true)
    assert.equal(createdTabs[1].cookieStoreId, 'firefox-container-1')
})

test('exceptions still win over always-ask patterns', async () => {
    const {handleRequest, createdTabs} = await loadBackground({
        urlExceptions: [{id: '1', pattern: '.+example\\.com/sso.+'}],
        urlAlwaysAsk: [{id: '2', pattern: '.+example\\.com.+'}],
    })

    const result = await handleRequest(mainFrameRequest('https://example.com/sso/callback'))

    assert.equal(result, undefined)
    assert.deepEqual(createdTabs, [])
})

test('always-ask patterns do not re-prompt a tab that is already contained', async () => {
    const {handleRequest, createdTabs} = await loadBackground({
        urlAlwaysAsk: [{id: '1', pattern: '.+example\\.com.+'}],
    }, {containedTab: true})

    const result = await handleRequest(mainFrameRequest('https://example.com/page'))

    assert.equal(result, undefined)
    assert.deepEqual(createdTabs, [])
})

test('choosing no container opens the url outside every container', async () => {
    const {createdTabs, removedTabIds, sendMessage} = await loadBackground({})

    const response = await sendMessage(
        {type: 'open-uncontained', url: 'https://example.com/page'},
        {tab: {id: 7, active: true, index: 0, windowId: 1}},
    )

    assert.equal(response.ok, true)
    assert.equal(createdTabs.length, 1)
    assert.equal(createdTabs[0].url, 'https://example.com/page')
    // no cookieStoreId at all, so the tab lands in the default store
    assert.equal('cookieStoreId' in createdTabs[0], false)
    // the chooser tab is closed behind it
    assert.deepEqual(removedTabIds, [7])
})

test('a tab opened without a container is never asked again', async () => {
    const {handleRequest, createdTabs, sendMessage} = await loadBackground({})

    await sendMessage(
        {type: 'open-uncontained', url: 'https://example.com/page'},
        {tab: {id: 7, active: true, index: 0, windowId: 1}},
    )
    const tabsAfterChoice = createdTabs.length

    // the replacement tab, and anything it navigates to afterwards
    assert.equal(await handleRequest(mainFrameRequest('https://example.com/page', 99)), undefined)
    assert.equal(await handleRequest(mainFrameRequest('https://elsewhere.example/other', 99)), undefined)
    assert.equal(createdTabs.length, tabsAfterChoice)
})

test('the uncontained choice covers a request that arrives before the tab is known', async () => {
    const {handleRequest, createdTabs, sendMessage} = await loadBackground({})

    await sendMessage(
        {type: 'open-uncontained', url: 'https://example.com/page'},
        {tab: {id: 7, active: true, index: 0, windowId: 1}},
    )
    const tabsAfterChoice = createdTabs.length

    // a tab id the background has not recorded yet still matches on the url
    assert.equal(await handleRequest(mainFrameRequest('https://example.com/page', 123)), undefined)
    assert.equal(createdTabs.length, tabsAfterChoice)
})

test('the uncontained choice is consumed, so a later visit asks again', async () => {
    const {handleRequest, createdTabs, sendMessage} = await loadBackground({})

    await sendMessage(
        {type: 'open-uncontained', url: 'https://example.com/page'},
        {tab: {id: 7, active: true, index: 0, windowId: 1}},
    )
    await handleRequest(mainFrameRequest('https://example.com/page', 123))
    const tabsAfterChoice = createdTabs.length

    // a fresh tab loading the same url gets the chooser again
    const result = await handleRequest(mainFrameRequest('https://example.com/page', 456))

    assert.equal(result.cancel, true)
    assert.equal(createdTabs.length, tabsAfterChoice + 1)
    assert.match(createdTabs[tabsAfterChoice].url, /\/togo\/index\.html\?go=/)
})

test('an uncontained choice without a source tab is refused', async () => {
    const {createdTabs, sendMessage} = await loadBackground({})

    const response = await sendMessage({type: 'open-uncontained', url: 'https://example.com/page'}, {})

    assert.equal(response.ok, false)
    assert.deepEqual(createdTabs, [])
})

<template>
    <section class="containment-settings">
        <label>
            <input type="checkbox" v-model="containUnmatchedUrls" @change="saveContainUnmatchedUrls"/>
            Open unmatched URLs in a container
        </label>
        <p>
            When enabled, every URL loaded outside a container asks which container to use unless it matches an
            exception below. When disabled, only URLs matching a pattern mapping or an always-ask pattern are
            contained, and every other URL loads normally without a prompt.
        </p>
    </section>
    <table>
        <thead>
        <tr>
            <th colspan="6">URL Pattern Mappings <span class="priority-hint">(top = highest priority)</span></th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="(url, index) in urlContainerMappings" :key="url.id">
            <td class="order-controls">
                <button @click="moveUrlUp(index)" :disabled="index === 0" title="Move up (higher priority)">↑</button>
                <button @click="moveUrlDown(index)" :disabled="index === urlContainerMappings.length - 1" title="Move down (lower priority)">↓</button>
            </td>
            <td>URL Pattern</td>
            <td><input type="text" v-model="url.pattern"/></td>
            <td>Container</td>
            <td>
                <select v-model="url.containerName">
                    <option v-for="container in contextualIdentities" :key="container.cookieStoreId" :value="container.name">
                        {{ container.name }}
                    </option>
                </select>
            </td>
            <td>
                <button @click="removeUrl(url.id)">Remove</button>
            </td>
        </tr>
        <tr>
            <td>&nbsp;</td>
            <td colspan="2" class="actions">
                <button @click="save">Save</button>
            </td>
            <td>&nbsp;</td>
            <td colspan="2" class="actions">
                <button @click="addUrlContainerMapping" :disabled="contextualIdentities.length === 0">Add Url</button>
            </td>
        </tr>
        </tbody>
    </table>
    <table>
        <thead>
        <tr>
            <th colspan="3">Always Ask For Container <span class="priority-hint">(overrides the mappings above)</span></th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="url in urlAlwaysAsk" :key="url.id">
            <td>URL Pattern</td>
            <td><input type="text" v-model="url.pattern"/></td>
            <td>
                <button @click="removeUrl(url.id)">Remove</button>
            </td>
        </tr>
        <tr>
            <td class="actions">
                <button @click="save">Save</button>
            </td>
            <td>&nbsp;</td>
            <td class="actions">
                <button @click="addUrlAlwaysAsk">Add Url</button>
            </td>
        </tr>
        </tbody>
    </table>
    <table>
        <thead>
        <tr>
            <th colspan="3">URL Container Exceptions <span class="priority-hint">(checked first, overrides everything)</span></th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="url in urlExceptions" :key="url.id">
            <td>URL Pattern</td>
            <td><input type="text" v-model="url.pattern"/></td>
            <td>
                <button @click="removeUrl(url.id)">Remove</button>
            </td>
        </tr>
        <tr>
            <td class="actions">
                <button @click="save">Save</button>
            </td>
            <td>&nbsp;</td>
            <td class="actions">
                <button @click="addUrlException">Add Url</button>
            </td>
        </tr>
        </tbody>
    </table>

    <section class="url-discovery">
        <h2>Discover redirect URLs</h2>
        <p>
            Start capture, reproduce the navigation in another tab, then stop capture and create a rule from the
            observed top-level URLs.
        </p>
        <p class="privacy-warning">
            Captured URLs may contain sensitive data. They remain in memory only and are cleared when you apply or
            discard the capture.
        </p>
        <div class="discovery-controls">
            <button v-if="!discoverySession.active" @click="startDiscovery">Start capture</button>
            <button v-else @click="stopDiscovery">Stop capture</button>
            <button @click="clearDiscovery" :disabled="!discoverySession.active && discoverySession.entries.length === 0">
                Discard capture
            </button>
            <span v-if="discoverySession.active" class="capture-active">Capture active</span>
            <span>{{ discoverySession.entries.length }} events</span>
        </div>
        <p v-if="discoveryError" class="error-message">{{ discoveryError }}</p>
        <p v-if="ruleAddedMessage" class="success-message">{{ ruleAddedMessage }}</p>

        <ol v-if="discoverySession.entries.length" class="discovery-events">
            <li v-for="entry in discoverySession.entries" :key="entry.sequence">
                <div class="event-details">
                    <span class="event-kind">{{ entry.type }}</span>
                    <span class="tab-id">Tab {{ entry.tabId }}</span>
                    <template v-if="entry.type === 'redirect'">
                        <code>{{ entry.url }}</code>
                        <span aria-label="redirects to">→</span>
                        <code>{{ entry.redirectUrl }}</code>
                        <span v-if="entry.statusCode">({{ entry.statusCode }})</span>
                    </template>
                    <template v-else>
                        <code>{{ entry.url }}</code>
                        <span v-if="entry.statusCode">({{ entry.statusCode }})</span>
                        <span v-if="entry.error">({{ entry.error }})</span>
                    </template>
                </div>
                <div v-if="candidateUrl(entry)" class="event-actions">
                    <button @click="openRuleDraft(candidateUrl(entry), 'mapping')"
                            :disabled="contextualIdentities.length === 0">
                        Create mapping
                    </button>
                    <button @click="openRuleDraft(candidateUrl(entry), 'alwaysAsk')">Create always-ask</button>
                    <button @click="openRuleDraft(candidateUrl(entry), 'exception')">Create exception</button>
                </div>
            </li>
        </ol>

        <form v-if="ruleDraft" class="rule-draft" @submit.prevent="applyRuleDraft">
            <h3>Review suggested rule</h3>
            <p><strong>Captured URL:</strong> <code>{{ ruleDraft.url }}</code></p>
            <label>
                Rule type
                <select v-model="ruleDraft.type">
                    <option value="mapping">Container mapping</option>
                    <option value="alwaysAsk">Always ask for container</option>
                    <option value="exception">URL exception</option>
                </select>
            </label>
            <label>
                URL pattern
                <input type="text" v-model="ruleDraft.pattern"/>
            </label>
            <label v-if="ruleDraft.type === 'mapping'">
                Container
                <select v-model="ruleDraft.containerName">
                    <option v-for="container in contextualIdentities" :key="container.cookieStoreId" :value="container.name">
                        {{ container.name }}
                    </option>
                </select>
            </label>
            <p v-if="ruleDraftPatternError" class="error-message">{{ ruleDraftPatternError }}</p>
            <p v-else>{{ ruleDraftMatchCount }} captured URL(s) match this pattern.</p>
            <div class="draft-actions">
                <button type="submit" :disabled="!canApplyRuleDraft">Add draft rule</button>
                <button type="button" @click="ruleDraft = null">Cancel</button>
            </div>
        </form>
    </section>

    <section class="debug-settings">
        <label>
            <input type="checkbox" v-model="debugLogging" @change="saveDebugLogging"/>
            Enable debug logging
        </label>
        <p>Logs complete URLs and patterns to the Browser Console. This may expose sensitive information.</p>
    </section>
</template>

<script>
import {toRaw} from 'vue'
import {v4 as uuid} from 'uuid'

import {getPatternError, suggestUrlPattern} from './urlPatternSuggestions.mjs'

const URL_DISCOVERY_MESSAGE_TYPE = 'url-discovery'
const DISCOVERY_POLL_INTERVAL_MS = 750

export default {
    data() {
        return {
            urlContainerMappings: [],
            urlAlwaysAsk: [],
            urlExceptions: [],
            contextualIdentities: [],
            containUnmatchedUrls: true,
            debugLogging: false,
            discoverySession: {
                active: false,
                startedAt: null,
                entries: [],
            },
            discoveryError: '',
            discoveryPollId: null,
            ruleDraft: null,
            ruleAddedMessage: '',
        }
    },
    computed: {
        discoveryCandidateUrls() {
            const urls = new Set()
            for (const entry of this.discoverySession.entries) {
                if (entry.type === 'request' && entry.url) {
                    urls.add(entry.url)
                } else if (entry.type === 'redirect' && entry.redirectUrl) {
                    urls.add(entry.redirectUrl)
                }
            }
            return [...urls]
        },
        ruleDraftPatternError() {
            return this.ruleDraft ? getPatternError(this.ruleDraft.pattern) : ''
        },
        ruleDraftMatchCount() {
            if (!this.ruleDraft || this.ruleDraftPatternError) return 0
            const pattern = new RegExp(this.ruleDraft.pattern)
            return this.discoveryCandidateUrls.filter(url => pattern.test(url)).length
        },
        canApplyRuleDraft() {
            if (!this.ruleDraft || this.ruleDraftPatternError) return false
            return this.ruleDraft.type !== 'mapping' || Boolean(this.ruleDraft.containerName)
        },
    },
    async mounted() {
        const {urlContainerMappings, urlAlwaysAsk, urlExceptions, containUnmatchedUrls} = await browser.storage.sync.get({
            urlContainerMappings: [],
            urlAlwaysAsk: [],
            urlExceptions: [],
            containUnmatchedUrls: true,
        })
        const {debugLogging} = await browser.storage.local.get({debugLogging: false})
        this.urlContainerMappings = urlContainerMappings
        this.urlAlwaysAsk = urlAlwaysAsk
        this.urlExceptions = urlExceptions
        this.containUnmatchedUrls = containUnmatchedUrls !== false
        this.debugLogging = debugLogging
        browser.storage.onChanged.addListener(this.syncStorage)
        this.contextualIdentities = await browser.contextualIdentities.query({})
        await this.refreshDiscovery()
        if (this.discoverySession.active) {
            this.startDiscoveryPolling()
        }
    },
    unmounted() {
        browser.storage.onChanged.removeListener(this.syncStorage)
        this.stopDiscoveryPolling()
    },
    methods: {
        addUrlContainerMapping() {
            const defaultContainer = this.contextualIdentities[0]
            if (!defaultContainer) return
            this.urlContainerMappings.push({
                id: uuid(),
                pattern: '',
                // Use name as assumed unique container identifier, as this is how the Multi-Account
                // Containers extension handles uniqueness when syncing
                // See https://github.com/mozilla/multi-account-containers/blob/e5fa98d69e317b52b7ab107545f8ffdeb7b753a5/src/js/background/sync.js#L329
                containerName: defaultContainer.name,
            })
        },
        addUrlAlwaysAsk() {
            this.urlAlwaysAsk.push({
                id: uuid(),
                pattern: '',
            })
        },
        addUrlException() {
            this.urlExceptions.push({
                id: uuid(),
                pattern: '',
            })
        },
        save() {
            for (let i = this.urlContainerMappings.length - 1; i >= 0; i--) {
                if (this.urlContainerMappings[i].pattern === '') {
                    this.urlContainerMappings.splice(i, 1)
                }
            }
            for (let i = this.urlAlwaysAsk.length - 1; i >= 0; i--) {
                if (this.urlAlwaysAsk[i].pattern === '') {
                    this.urlAlwaysAsk.splice(i, 1)
                }
            }
            for (let i = this.urlExceptions.length - 1; i >= 0; i--) {
                if (this.urlExceptions[i].pattern === '') {
                    this.urlExceptions.splice(i, 1)
                }
            }
            browser.storage.sync.set({
                urlContainerMappings: toRaw(this.urlContainerMappings),
                urlAlwaysAsk: toRaw(this.urlAlwaysAsk),
                urlExceptions: toRaw(this.urlExceptions),
            })
        },
        async saveContainUnmatchedUrls() {
            await browser.storage.sync.set({
                containUnmatchedUrls: this.containUnmatchedUrls,
            })
        },
        async saveDebugLogging() {
            await browser.storage.local.set({
                debugLogging: this.debugLogging,
            })
        },
        syncStorage(changes, areaName) {
            if (areaName !== 'sync') return
            if (changes.urlContainerMappings) {
                this.urlContainerMappings = changes.urlContainerMappings.newValue
            }
            if (changes.urlAlwaysAsk) {
                this.urlAlwaysAsk = changes.urlAlwaysAsk.newValue
            }
            if (changes.urlExceptions) {
                this.urlExceptions = changes.urlExceptions.newValue
            }
            if (changes.containUnmatchedUrls) {
                this.containUnmatchedUrls = changes.containUnmatchedUrls.newValue !== false
            }
        },
        removeUrl(id) {
            this.urlExceptions = this.urlExceptions.filter(url => url.id !== id)
            this.urlAlwaysAsk = this.urlAlwaysAsk.filter(url => url.id !== id)
            this.urlContainerMappings = this.urlContainerMappings.filter(url => url.id !== id)
        },
        moveUrlUp(index) {
            if (index > 0) {
                const temp = this.urlContainerMappings[index - 1]
                this.urlContainerMappings[index - 1] = this.urlContainerMappings[index]
                this.urlContainerMappings[index] = temp
                this.save()
            }
        },
        moveUrlDown(index) {
            if (index < this.urlContainerMappings.length - 1) {
                const temp = this.urlContainerMappings[index + 1]
                this.urlContainerMappings[index + 1] = this.urlContainerMappings[index]
                this.urlContainerMappings[index] = temp
                this.save()
            }
        },
        async requestDiscovery(action) {
            const response = await browser.runtime.sendMessage({
                type: URL_DISCOVERY_MESSAGE_TYPE,
                action,
            })
            if (!response || !response.ok || !response.session) {
                throw new Error(response?.error || 'The background script did not return a discovery session.')
            }
            this.discoverySession = response.session
        },
        async runDiscoveryAction(action) {
            this.discoveryError = ''
            try {
                await this.requestDiscovery(action)
                return true
            } catch (error) {
                this.discoveryError = `Unable to ${action} URL capture: ${error.message}`
                return false
            }
        },
        async refreshDiscovery() {
            const refreshed = await this.runDiscoveryAction('snapshot')
            if (!refreshed) {
                this.stopDiscoveryPolling()
            }
        },
        async startDiscovery() {
            this.ruleAddedMessage = ''
            if (await this.runDiscoveryAction('start')) {
                this.startDiscoveryPolling()
            }
        },
        async stopDiscovery() {
            if (await this.runDiscoveryAction('stop')) {
                this.stopDiscoveryPolling()
            }
        },
        async clearDiscovery() {
            if (await this.runDiscoveryAction('clear')) {
                this.stopDiscoveryPolling()
                this.ruleDraft = null
            }
        },
        startDiscoveryPolling() {
            this.stopDiscoveryPolling()
            this.discoveryPollId = window.setInterval(() => {
                this.refreshDiscovery()
            }, DISCOVERY_POLL_INTERVAL_MS)
        },
        stopDiscoveryPolling() {
            if (this.discoveryPollId !== null) {
                window.clearInterval(this.discoveryPollId)
                this.discoveryPollId = null
            }
        },
        candidateUrl(entry) {
            if (entry.type === 'request') return entry.url
            if (entry.type === 'redirect') return entry.redirectUrl
            return ''
        },
        openRuleDraft(url, type) {
            this.discoveryError = ''
            try {
                this.ruleDraft = {
                    url,
                    type,
                    pattern: suggestUrlPattern(url),
                    containerName: this.contextualIdentities[0]?.name || '',
                }
            } catch (error) {
                this.discoveryError = `Unable to suggest a pattern for this URL: ${error.message}`
            }
        },
        async applyRuleDraft() {
            if (!this.canApplyRuleDraft) return

            if (this.ruleDraft.type === 'mapping') {
                this.urlContainerMappings.push({
                    id: uuid(),
                    pattern: this.ruleDraft.pattern,
                    containerName: this.ruleDraft.containerName,
                })
            } else if (this.ruleDraft.type === 'alwaysAsk') {
                this.urlAlwaysAsk.push({
                    id: uuid(),
                    pattern: this.ruleDraft.pattern,
                })
            } else {
                this.urlExceptions.push({
                    id: uuid(),
                    pattern: this.ruleDraft.pattern,
                })
            }
            this.ruleAddedMessage = 'Draft added to the configuration above. Review it and click Save to persist it.'
            await this.clearDiscovery()
        },
    },
}
</script>

<style lang="scss" scoped>
:global(:root) {
    color-scheme: light;
    --page-background: #ffffff;
    --surface-background: #f9f9fb;
    --control-background: #ffffff;
    --hover-background: #f1f1f4;
    --heading-background: #e9e9ef;
    --text-color: #15141a;
    --muted-text-color: #5b5b66;
    --border-color: #b1b1b8;
    --focus-color: #0060df;
    --capture-color: #9a4f00;
    --error-color: #a4000f;
    --success-color: #006b45;
    --code-background: #eeeeF2;
}

@media (prefers-color-scheme: dark) {
    :global(:root) {
        color-scheme: dark;
        --page-background: #1c1b22;
        --surface-background: #2b2a33;
        --control-background: #42414d;
        --hover-background: #3a3944;
        --heading-background: #383741;
        --text-color: #fbfbfe;
        --muted-text-color: #cfcfd8;
        --border-color: #5b5b66;
        --focus-color: #00ddff;
        --capture-color: #ffbd4f;
        --error-color: #ff9aa2;
        --success-color: #54ffbd;
        --code-background: #15141a;
    }
}

:global(body) {
    background-color: var(--page-background);
    color: var(--text-color);
    font-family: system-ui, sans-serif;
}

th,
td {
    border: 1px solid var(--border-color);
    padding: 12px;
}

th {
    background-color: var(--heading-background);
}

tr:nth-child(even) {
    background-color: var(--surface-background);
}

tr:hover {
    background-color: var(--hover-background);
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 20px 0;
    text-align: left;
}

input[type='text'] {
    box-sizing: border-box;
    width: 100%;
}

button,
input,
select {
    background-color: var(--control-background);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    color: var(--text-color);
    font: inherit;
}

button,
select {
    padding: 5px 8px;
}

button {
    cursor: pointer;
}

button:hover:not(:disabled) {
    background-color: var(--hover-background);
}

button:disabled {
    color: var(--muted-text-color);
    cursor: not-allowed;
    opacity: 0.65;
}

button:focus-visible,
input:focus-visible,
select:focus-visible {
    outline: 2px solid var(--focus-color);
    outline-offset: 2px;
}

.actions {
    text-align: center;
}

.order-controls {
    display: flex;
    gap: 4px;
    justify-content: center;
}

.order-controls button {
    padding: 4px 8px;
    min-width: 32px;
}

.order-controls button:disabled {
    opacity: 0.65;
}

.priority-hint {
    font-size: 0.8em;
    font-weight: normal;
    opacity: 0.7;
}

.containment-settings,
.url-discovery,
.debug-settings {
    margin: 20px 0;
}

.url-discovery {
    background-color: var(--surface-background);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 16px;
}

.url-discovery h2 {
    margin-top: 0;
}

.privacy-warning {
    font-weight: 600;
}

.discovery-controls,
.draft-actions,
.event-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
}

.capture-active {
    color: var(--capture-color);
    font-weight: 700;
}

.discovery-events {
    padding-left: 28px;
}

.discovery-events li {
    margin: 12px 0;
}

.event-details {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
}

.event-kind {
    min-width: 70px;
    font-weight: 700;
    text-transform: capitalize;
}

.tab-id {
    opacity: 0.7;
}

code {
    background-color: var(--code-background);
    border-radius: 3px;
    overflow-wrap: anywhere;
    padding: 1px 3px;
}

.event-actions {
    margin: 6px 0 0 78px;
}

.rule-draft {
    border-top: 1px solid var(--border-color);
    margin-top: 18px;
    padding-top: 12px;
}

.rule-draft label {
    display: block;
    margin: 12px 0;
}

.rule-draft label > input,
.rule-draft label > select {
    display: block;
    margin-top: 4px;
}

.error-message {
    color: var(--error-color);
}

.success-message {
    color: var(--success-color);
    font-weight: 600;
}

.priority-hint,
.tab-id,
.containment-settings p,
.debug-settings p {
    color: var(--muted-text-color);
}

.containment-settings p,
.debug-settings p {
    margin-top: 6px;
}
</style>

# addons.mozilla.org listing copy

Paste-ready metadata for the Container Router listing. Keep this in sync with the
extension whenever behaviour or requirements change.

## Name

Container Router

## Categories

Firefox: **Privacy & Security** and **Tabs** (AMO allows two).

## Summary (237 characters, limit 250)

Open URLs in Multi-Account Containers using regular expressions matched against the whole URL, not just the domain. Contain every uncontained page by default, or only the patterns you configure. Requires Firefox Multi-Account Containers.

## Description

AMO renders this field with a limited subset of Markdown, not HTML. Bold, italic,
links, blockquotes, code blocks and lists are supported; headings are not, so the
section labels below are bold text. Raw HTML tags appear literally and must not be
used here.

Container Router opens URLs in Firefox Multi-Account Containers based on regular expressions matched against the entire URL, not just the domain. That makes it possible to route one GitHub organization into a Work container while everything else on the same host goes somewhere else.

**Two ways to work**

By default, any page loaded outside a container asks which container to use, and you list exceptions for the URLs that should be left alone.

Or turn off "Open unmatched URLs in a container" in the preferences and the extension does the opposite: only URLs matching a pattern you configured are contained, and every other URL loads normally with no prompt.

**Features**

- Regular expression matching against the full URL, including path and query
- Pattern to container mappings, ordered by priority, where the first match wins
- Always-ask patterns for URLs that should always present the container chooser, overriding the mappings
- Exception patterns for URLs that should never be contained, which take priority over everything else
- Redirect URL discovery: capture a login or VPN flow, review the top level URLs it passed through, and turn one into a rule with a suggested pattern
- Optional debug logging for troubleshooting pattern matches

**Requirements**

Firefox's Multi-Account Containers extension must be installed and enabled. Container Router does nothing without it. Hosts you route with Container Router should not also be assigned to a container in Multi-Account Containers.

**Privacy**

Container Router collects nothing and sends nothing anywhere. Your patterns live in Firefox's extension storage and follow your Firefox Account if you have sync turned on. URLs captured by the discovery tool are held in memory only and are cleared when you apply or discard a capture.

**Source and license**

Container Router is a fork of [Container Sentry](https://github.com/abg1979/container-sentry) by abg1979, published under the Mozilla Public License 2.0. [Source and build instructions](https://github.com/RashKash103/container-router)

## Version 1.2.0

### Release notes

Shown on the listing for this version. Same limited Markdown as the description.

**Added**

- An **Always Ask For Container** list. URLs matching one of these patterns always present the container chooser, so you can choose at the moment you open the page instead of routing it in advance.
- Always-ask patterns take priority over the pattern container mappings, so a narrow pattern can carve a single URL out of a broad mapping, and they apply even when **Open unmatched URLs in a container** is turned off.
- The redirect URL discovery tool can draft an always-ask pattern alongside container mappings and exceptions.

Exceptions continue to take priority over every other rule, and a tab that is already inside a container is never asked about again.

### Notes for reviewers

**Source and build**

This add-on bundles its settings page with webpack, so `settings/settings.bundle.js` is generated and minified. The source archive uploaded with this version is `container_router-1.2.0-source.zip`.

The uploaded package and source archive are the artifacts published by this project's release workflow, `.github/workflows/release.yaml`, built on GitHub's `ubuntu-latest` runner with the Node and Yarn versions pinned in `mise.toml` (Node 22, Yarn 4.12.0).

To rebuild locally, from the root of the source archive. Yarn 4 is not the `yarn` package on npm, so install it from `@yarnpkg/cli-dist`:

```
npm install --global @yarnpkg/cli-dist@4.12.0
yarn install --immutable
yarn gulp build
```

Node 22 or newer is required; no other tooling is needed. This writes the unpacked extension to `build/webpack/`, which is exactly what the uploaded XPI contains, so the two can be compared file by file. `readme.md` covers this under "Reproducing the build for AMO review".

**What changed since 1.1.0**

Only the settings page and the background script changed, to add a third list of URL patterns that force the container chooser. No new permissions are requested and the manifest permissions are unchanged. The add-on still collects nothing and contacts no server; all configuration lives in `browser.storage.sync`.

**Known linter warning**

The validator reports one `UNSAFE_VAR_ASSIGNMENT` for an `innerHTML` assignment in `settings/settings.bundle.js`. That line is `insertStaticContent` in Vue's `@vue/runtime-dom` `nodeOps` object, which is bundled unconditionally as part of the framework runtime. The settings page uses no `v-html` and never reaches that code path.

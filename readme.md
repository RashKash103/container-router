# Container Router

Container Router is a [Firefox](https://www.mozilla.org/firefox/) extension to open any URL (not just those with a specific domain) in a multi-account
container. It also allows to specify regular expressions for urls which are allowed to be loaded outside a container.

Container Router is a fork of [Container Sentry](https://github.com/abg1979/container-sentry) by abg1979, published separately under the same
[MPL-2.0](LICENSE) license. It adds an **Open unmatched URLs in a container** preference, so the extension can contain only the URL patterns you
configure instead of prompting for a container on every uncontained page. It is a distinct add-on with its own extension ID, and it is not affiliated
with or endorsed by the original author.

The original extension was written because a VPN provider opens a local html page which redirects to the authentication page.
The [Always in Container](https://addons.mozilla.org/en-US/firefox/addon/always-in-container) extension intercepts this request and breaks the context
which in the end fails the logon to VPN.

The extension consists of a [settings page](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Implement_a_settings_page) (
`src/settings/`) built with [Vue.js](https://vuejs.org/), and
a [background script](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Intercept_HTTP_requests) (`src/background/`).
The settings page allows users to define regex patterns that, when matched against a URL loaded in the browser, will open that URL in a specified
container tab. The background script listens for update events in browser tabs and performs the regex matching and opening of container tabs.

Firefox's [Multi-Account Containers](https://support.mozilla.org/kb/containers) extension provides similar functionality out of the box, but only
allows for matching URLs based on a domain. This extension allows for regex matching against the whole URL as opposed to exact matches based on
domain.

## Installation

This extension is distributed through [addons.mozilla.org](https://addons.mozilla.org/firefox/). Replace this line with the listing URL once the
first version has been published.

Container Router and the original Container Sentry use different extension IDs, so both can be installed side by side. They do not share settings:
each add-on keeps its own URL patterns in its own synced storage.

## How to use

Any url patterns which are to be used with this extension should not have their hostnames assigned to the MAC addon.

### Opening unmatched URLs in a container

By default the extension asks which container to use for every URL loaded outside a container, unless the URL matches an
exception. To only contain the URLs you have configured, open the extension preferences and clear **Open unmatched URLs
in a container**. Every URL that does not match a pattern container mapping then loads normally, and the exceptions list
is no longer consulted. The setting is synced with the rest of the configuration and is enabled by default.

### Exceptions

Use the settings page to define url pattern exceptions for which the extension should not try to contain them.
However if the MAC addon has the host configured to open in a container it may still try to open it in the assigned container.
Exceptions only matter while **Open unmatched URLs in a container** is enabled, because that is the only mode in which
unconfigured URLs are contained at all.

### Pattern Container Mappings

Use the settings page to define url pattern to container mappings. It is possible that some of the intermediate pages may have to either
added to the exceptions list. For example, for opening a corporate github repo in a work container, the github login page may redirect to 
the corporate login page. In this case, the itermediate github.com/enterprises page has to be added to the exceptions list.

Here is the configuration which worked for me:

- Exceptions
  - `.+github.com/enterprises+`
  - `.+corporate_login_page_url.+` # This was needed for the VPN to work anyway.

- Pattern Container Mappings
  - `.+github.com.+corporate_github_org.+` -> Work
  - `.+github.com.+` -> Code

### Discovering redirect URLs

If a login or VPN flow passes through URLs that are difficult to identify, open the extension preferences and use **Discover redirect URLs**:

1. Select **Start capture**.
2. Reproduce the navigation in another tab, choosing a container if prompted.
3. Return to the preferences and select **Stop capture**.
4. Review the top-level requests and redirects, then create either a container mapping or an exception from the relevant URL.
5. Review the suggested regular expression and add it as a draft. The suggestion uses the URL origin and path while omitting query parameters and fragments by default.
6. Review the new entry in the configuration and select **Save**.

Capture is opt-in and held only in the background script's memory; it is never written to local or synced extension storage. Complete captured URLs
are shown during review and may still contain sensitive authentication data. Apply a rule or select **Discard capture** to clear them.

### Debug logging

To troubleshoot pattern matching, open the extension preferences and enable **Debug logging**, then open Firefox's Browser Console. Debug logging
includes complete URLs and configured patterns, which may contain sensitive information. It is disabled by default and should be turned off after
troubleshooting. For redirect discovery, prefer the guided capture workflow above.

## Contributing

### Prerequisites

Development on, or building of, this extension requires Firefox, [Node.js](https://nodejs.org) v20+, and [Yarn](https://yarnpkg.com/getting-started).
Older versions of Node will probably work, they just haven't been tested.

### Development

To load the extension in a development instance of Firefox with automatic reloading enabled, run:

```shell
yarn install
npm run start
```

### Building

To build and package the extension for distribution, run:

```shell
yarn install
gulp dist
```

This will run a webpack build and place the output in `build/webpack/`, followed by packaging the extension using `web-ext` and placing output
in `dist/`.

### Releasing

GitHub Releases are created from a clean, synchronized `main` branch using PowerShell 7. Add the release notes under `Unreleased` in
`changelog.md`, then run:

```powershell
pwsh ./scripts/release.ps1 -Version 1.1.1
```

The script updates the package and extension versions, promotes the changelog notes, runs the project checks, commits and waits for CI, creates
and pushes the version tag, builds the XPI and source archive, generates SHA-256 checksums, and publishes the GitHub Release. It requires
authenticated `gh`, `git`, and `mise` commands.

### Reproducing the build for AMO review

The packaged extension contains `settings/settings.bundle.js`, which webpack generates and minifies from `src/settings/`. Add-ons that ship generated
code must be submitted to [addons.mozilla.org](https://addons.mozilla.org/) together with their source. `gulp dist` writes both artifacts: the
installable `dist/container_router-<version>.xpi` and the matching source archive `dist/src.zip`.

Build environment:

- Any OS with a POSIX shell. This build was produced on Linux with Node 26.8.1; AMO's default reviewer image, Ubuntu 24.04 with Node 24, satisfies
  the requirements below.
- [Node.js](https://nodejs.org) 22 or newer. `mise.toml` pins Node 22; newer releases also build the project.
- [Yarn](https://yarnpkg.com) 4.12.0, pinned in `mise.toml`. Yarn 4 is not published as the `yarn` package on npm; install it from
  `@yarnpkg/cli-dist`, or through [mise](https://mise.jdx.dev) or `corepack`.
- No other tooling is required, and no step needs network access beyond the dependency install.

To rebuild from the source archive:

```shell
npm install --global @yarnpkg/cli-dist@4.12.0
yarn install --immutable
yarn gulp build
```

`yarn` must be on `PATH` for the `gulp` tasks, which shell out to `yarn webpack` and `yarn web-ext build`. To build without installing Yarn globally,
run the two underlying commands directly:

```shell
npx --yes @yarnpkg/cli-dist@4.12.0 install --immutable
npx webpack
npx web-ext build
```

Either sequence writes the unpacked extension to `build/webpack/` and the packaged add-on to `dist/`. The contents of `build/webpack/` are what the
XPI contains, so they can be compared file by file against the uploaded package.

### Credits

This extension is a fork of [Container Sentry](https://github.com/abg1979/container-sentry) by abg1979, which in turn borrows a lot from the
following extensions

1. <https://addons.mozilla.org/en-US/firefox/addon/always-in-container> | <https://github.com/tiansh/always-in-container>
2. <https://addons.mozilla.org/en-GB/firefox/addon/open-urls-in-container/> | <https://gitlab.com/hughblackall/open-urls-in-container>

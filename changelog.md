# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [v1.1.0]

- Rename the extension to Container Router and publish it as a separate add-on with its own extension ID, forked from
  Container Sentry under the MPL-2.0 license.
- Add an **Open unmatched URLs in a container** preference so the container chooser can be turned off, containing only
  the configured URL pattern mappings.
- Document how to reproduce the webpack build for addons.mozilla.org source code review.
- Raise the minimum supported Firefox to 142, the first release where both desktop and Android support the
  `data_collection_permissions` manifest key the add-on already declares.
- Stop webpack from emitting its `new Function('return this')` global helper, which add-on review flags as an eval.

## [v1.0.10]

- Replace the extension icon with a high-contrast shield and secured-container design, including high-DPI manifest support.

## [v1.0.9]

- Add a PowerShell 7 script for validating, tagging, packaging, and publishing GitHub Releases.
- Fix the settings page colors and form controls for readable light and dark themes.

## [v1.0.8]

- Add an opt-in, memory-only redirect URL discovery workflow that can draft reviewed container mappings or exceptions.
- Ignore malformed URL patterns without preventing later exception or container-mapping rules from matching.
- Keep the container chooser open until its replacement tab has been created successfully.
- Make full-URL and pattern debug logging opt-in through the extension preferences and store the setting locally.
- Upgrade project dependencies, including Vue, Sass, Webpack, css-loader, and UUID.
- Upgrade GitHub Actions to Node 24-based releases and pin Yarn for reproducible immutable installs.

## [v1.0.7]

- Added ordering support for URL mappings:
  - Users can now reorder URL pattern mappings in the settings UI.
  - Updated `src/settings/Settings.vue` with reordering functionality.
  - Enhanced `src/background/background.js` to respect the order of URL mappings when determining which container to use.
- Updated `src/extension/manifest.json`:
  - Version bump to 1.0.7.
- Updated `.vscode/launch.json`:
  - Updated debugger extension ID for improved debugging experience.

## [v1.0.6]

- Updated `package.json` and `src/extension/manifest.json`:
  - Version bump to 1.0.6.
- Updated `src/background/background.js`:
  - Changed early cancellation logic to log and return void instead of `{cancel: true}` for better debugging and extension behavior.
- Updated `.vscode/launch.json`:
  - Updated extension UUID in pathMappings for debugging.

## [v1.0.5]

- Added `gulpfile.js` and `mise.toml` for new build and environment management workflows.
- Updated `package.json`:
  - Version bump to 1.0.5.
  - Upgraded dependencies: `concurrently`, `sass`, `sass-loader`, `vue`.
  - Added dev dependencies: `@types/firefox-webext-browser`, `gulp`, `gulp-clean`.
  - Removed custom clean script and Volta config.
- Updated `src/background/background.js`:
  - Made tab creation and removal fully async for reliability.
  - Improved comments and container chooser logic.
- Updated `src/extension/manifest.json`:
  - Version bump to 1.0.5.
- Updated `.vscode/launch.json`:
  - Changed debug profile to `developer` and improved path mappings.
- Removed `tools/clean.js` (now handled by gulp tasks).
- Various updates to config files and documentation for new build process and dependency management.

## [v1.0.4]

- Updated `src/background/background.js`:
  - Improved error handling and debug logging for MAC assignment and URL exceptions.
  - Refined logic for container switching, including better handling of already-contained tabs and incognito tabs.
  - Enhanced response structure for container switching and error cases.
- Updated `src/extension/manifest.json`:
  - Version bump to 1.0.4.
- Updated `.vscode/launch.json`:
  - Added `pathMappings` for improved debugging experience.

## [v1.0.3]

- Updated `package.json` and `src/extension/manifest.json`: - Version bump to 1.0.3.
- Updated `webpack.config.js`: - Changed build mode from `none` to `production` for optimized builds. - Minor formatting fix in CopyPlugin config.

## [v1.0.2]

- Added `.editorconfig` and `yarn.lock` for improved code consistency and dependency management.
- Updated `src/background/background.js`: - Improved logic for handling Multi-Account Containers (MAC) and URL exceptions. - Added checks for MAC extension state and URL assignments. - Enhanced debug logging and container switching logic.
- Updated `src/extension/manifest.json`:
  - Version bump to 1.0.2.
  - Minor formatting and metadata updates.
- Updated `src/settings/Settings.vue`:
  - Refactored UI markup and logic for URL pattern mappings and exceptions.
  - Improved methods for adding/removing mappings and exceptions.
  - Enhanced storage sync and contextual identities handling.
- Various updates to config and localization files for improved build, launch, and internationalization support.

## [v1.0.1]

- Initial public release.
- Core features:
  - Open URLs in Firefox Multi-Account Containers by default.
  - Assign containers to URLs using regex patterns.
  - Exception system for specific sites.
  - Settings UI for managing URL mappings and exceptions.
  - Support for multiple locales (English, Polish, Chinese).
- Includes build scripts, webpack config, and extension manifest.
- Added documentation and initial CI workflow.

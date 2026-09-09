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

Container Router opens URLs in Firefox Multi-Account Containers based on regular expressions matched against the entire URL, not just the domain. That makes it possible to route one GitHub organization into a Work container while everything else on the same host goes somewhere else.

<b>Two ways to work</b>

By default, any page loaded outside a container asks which container to use, and you list exceptions for the URLs that should be left alone.

Or turn off "Open unmatched URLs in a container" in the preferences and the extension does the opposite: only URLs matching a pattern you configured are contained, and every other URL loads normally with no prompt.

<b>Features</b>

<ul>
<li>Regular expression matching against the full URL, including path and query</li>
<li>Pattern to container mappings, ordered by priority, where the first match wins</li>
<li>Exception patterns for URLs that should never be contained</li>
<li>Redirect URL discovery: capture a login or VPN flow, review the top level URLs it passed through, and turn one into a rule with a suggested pattern</li>
<li>Optional debug logging for troubleshooting pattern matches</li>
</ul>

<b>Requirements</b>

Firefox's Multi-Account Containers extension must be installed and enabled. Container Router does nothing without it. Hosts you route with Container Router should not also be assigned to a container in Multi-Account Containers.

<b>Privacy</b>

Container Router collects nothing and sends nothing anywhere. Your patterns live in Firefox's extension storage and follow your Firefox Account if you have sync turned on. URLs captured by the discovery tool are held in memory only and are cleared when you apply or discard a capture.

<b>Source and license</b>

Container Router is a fork of Container Sentry by abg1979, published under the Mozilla Public License 2.0. Source and build instructions: https://github.com/RashKash103/container-router

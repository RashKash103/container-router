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
- Exception patterns for URLs that should never be contained
- Redirect URL discovery: capture a login or VPN flow, review the top level URLs it passed through, and turn one into a rule with a suggested pattern
- Optional debug logging for troubleshooting pattern matches

**Requirements**

Firefox's Multi-Account Containers extension must be installed and enabled. Container Router does nothing without it. Hosts you route with Container Router should not also be assigned to a container in Multi-Account Containers.

**Privacy**

Container Router collects nothing and sends nothing anywhere. Your patterns live in Firefox's extension storage and follow your Firefox Account if you have sync turned on. URLs captured by the discovery tool are held in memory only and are cleared when you apply or discard a capture.

**Source and license**

Container Router is a fork of [Container Sentry](https://github.com/abg1979/container-sentry) by abg1979, published under the Mozilla Public License 2.0. [Source and build instructions](https://github.com/RashKash103/container-router)

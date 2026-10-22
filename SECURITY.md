# Security policy

## Reporting a problem

Report security problems privately through GitHub:
[Report a vulnerability](https://github.com/travisw84/smart-dark/security/advisories/new).
Do not open a public issue for them.

Include the Smart Dark version, the steps to reproduce, and what an attacker gains. I aim to reply within a week. This is a hobby project, so fix times vary, but anything that exposes a user's API key, screenshots or browsing data comes first.

## Supported versions

Only the latest release gets fixes.

## What counts as a security bug

- The optional TypeSafe API key must stay in extension storage and never reach page scripts.
- Screenshots must only leave the browser after the user turned screenshot sharing on, and not from pages with visible password, payment or one-time-code fields.
- The service worker fetches cross-origin stylesheets for the page. It must not become a way to reach private network addresses from another site.
- The extension must never run code, CSS or selectors that a model or a website supplies.

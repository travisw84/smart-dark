# Privacy

Smart Dark has no server, accounts, analytics or ads, and it does not record your browsing history.

## What stays on your device

Your settings, per-site choices, the optional API key, a daily request counter and a one-hour decision cache live in the extension's local storage in your Chrome profile. Nothing syncs.

The decision cache holds a SHA-256 digest of the page address and a small decision. It never holds the address itself.

## What leaves your device

Only the optional Jev check sends data. It runs only after you add your own TypeSafe API key and turn on screenshot sharing in Settings. Each check sends a JPEG screenshot of the visible part of the page with the dark theme applied, plus a few measurements of the page's original colours. The destination is api.typesafe.ai.

Screenshots are not redacted, so they can show anything visible on the page. Smart Dark skips pages with visible password, payment or one-time-code fields, but it cannot recognise every private page. Turn screenshot sharing off before you open private content. TypeSafe's terms cover how it handles the image, and your key may incur charges.

To theme a page, the service worker may fetch that page's stylesheets from other origins. Those requests carry no cookies and go to addresses the page already loads.

## Chrome permissions

The all-websites permission lets the extension theme every site, fetch stylesheets and take screenshots. The README explains the other three, which are storage, activeTab and webNavigation.

## Changes

Policy changes show up in the git history and the changelog.

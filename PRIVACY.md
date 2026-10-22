# Privacy

Smart Dark has no server, no account, no analytics and no advertising. It does not record your browsing history.

## What stays on your device

- Your settings, per-site choices, the optional API key, a daily request counter and a one-hour decision cache. They live in the extension's local storage in your Chrome profile. Nothing syncs.
- The decision cache stores a SHA-256 digest of the page address and a small decision, not the address itself.

## What leaves your device

Only the optional Jev check sends data, and only when you add your own TypeSafe API key and turn on screenshot sharing in Settings. A check sends:

- a JPEG screenshot of the visible part of the page, with the dark theme applied, and
- a few measurements of the page's original colours.

The destination is api.typesafe.ai. Screenshots are not redacted, so they can contain anything visible on the page. Smart Dark skips pages with visible password, payment or one-time-code fields, but it cannot recognise every private page. Turn screenshot sharing off before you open private content. TypeSafe's own terms govern how it handles the image. Your key may incur charges.

To theme a page, the extension's service worker may fetch that page's stylesheets from other origins. These requests carry no cookies and go to addresses the page already loads.

## Chrome permissions

The all-websites permission lets the extension theme every site, fetch stylesheets and take screenshots. The other permissions are storage, activeTab and webNavigation. The README explains each one.

## Changes

If this policy changes, the change appears in the repository history and the changelog.

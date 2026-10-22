# Changelog

All notable changes to Smart Dark. The format follows Keep a Changelog and the project uses semantic versioning.

## [0.2.0] - 2026-10-23

### Changed

- Rebuilt theming on stylesheet mirroring. The extension now rewrites the colours in the site's own rules instead of snapshotting each element, so hover, focus, CSS variables and elements added later follow the site's styles.
- Jev decisions now persist for the page. Scrolling and ordinary page updates no longer undo them. A result in flight is discarded only when the page's original look changes.
- Colour parsing is plain JavaScript for rgb, hsl, hwb, oklab, oklch, hex and named colours, with a one pixel canvas for lab, lch, color-mix and wide gamut colours.

### Fixed

- Theming no longer stalls on pages with more than about 1,000 elements. A 6,000 element test page is dark in about 140 ms on an idle machine.
- oklch() colours, such as those Tailwind v4 emits, are now themed.
- The service worker refuses to fetch private network stylesheets for another origin.

## [0.1.0] - 2026-10-22

### Added

- First beta: native site theme first, then an adaptive palette, with Dark Reader as an optional theme method.
- Optional Jev screenshot checks with your own TypeSafe key, off by default.
- Popup with Auto, Dark and Original per site, and a settings page for image privacy.

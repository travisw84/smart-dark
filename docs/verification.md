# Verification, 22 October 2026

## Completed

- Decision core: 19 Node unit tests pass, covering colour parsing, alpha composition, relative luminance/contrast, source classification, overrides, settings validation, provider image payloads and bounded responses.
- Browser integration: 23 Chromium extension checks passed in the complete run. The extension was loaded from the built dist into a fresh disposable browser profile. No normal Chrome profile or real provider credentials were used.
- Build: esbuild produced bundled local MV3 scripts and included the Dark Reader MIT license.
- Dependency audit: npm audit returned 0 vulnerabilities across production and development dependencies.
- Visual review: inspected the real popup document and settings screenshots, plus the original/adaptive synthetic gallery using the built-in computer-use browser and the generated image docs/preview.png.
- Local responsiveness: latest complete-suite synthetic navigation-to-dark was 97 ms. Previous fixture runs were approximately 93–216 ms. These are small local fixtures, not a general real-world benchmark or an AI latency measurement. Rendering yields across animation frames and never waits for Jev.

## Independent review and verified fixes

One independent, read-only reviewer found five issues. Each was reproduced with a failing browser regression before its fix, then passed:

1. Embedded sensitive fields: enumerate all frames before capture/upload and request their sensitive-input status. Block if any frame cannot be inspected or reports a password/payment/OTP field.
2. Stale same-page image decisions: content/text/input/scroll changes advance the document revision. In-flight results are discarded when revision, token, URL, focus or settings change.
3. Cross-page AI cache reuse: cache keys are SHA-256 digests of URL + source style fingerprint + treatment + exact screenshot. Images and URLs are not stored in the cache.
4. CSS growth during SPA replacement: retire detached subtree records and recycle empty CSSStyleRule objects. Repeated replacements now stay within a bounded rule pool.
5. Concurrent settings saves: serialize the complete read–merge–write operation. Both concurrent patches persist.

Also verified native class restoration preserves unrelated application classes, default mode preserves foreign Dark Reader styling, compatibility mode works, global disable restores original styling, and AI opt-out wins over an in-flight response.

## Boundaries

- The capture pipeline uses real Chrome JPEG captures. Provider responses are mocked at the fetch boundary, including the actual 12-second timeout. No test images or real user screenshots were sent to TypeSafe.
- Live Jev visual quality, billing and latency need a user-supplied key and an explicitly enabled image check. They have not been verified.
- Native dark activation, adaptive styling and image choices are best-effort. This beta does not promise every website will match its professionally designed native theme.
- Closed shadow DOM, canvas/WebGL, complex image backgrounds and specialised CSS may need Original or Compatibility mode.
- Screenshots are not redacted. Frame/password checks are a safeguard, not complete sensitive-content detection.

## Design decisions

- User explicitly requested native-like results beyond Dark Reader. Default engine is native CSS activation followed by the custom adaptive palette; Dark Reader is optional compatibility only.
- Screenshot checks assess the currently rendered page. Temporarily removing dark mode for capture would introduce visible flashes, so it is avoided.
- No hosted backend or bundled key. Optional personal key is kept in trusted extension storage.
- Regional Jev Box editing, synthetic visual maps and cross-site learning remain future experiments and are not advertised as implemented.

Final complete run: 19 unit + 23 browser checks passed, build passed, npm audit 0 vulnerabilities. The final popup/settings screenshot test renders the shipped popup document in a tab because headless Chromium does not expose its native action popup as an automation page.

## Copy cleanup and requested Opus review

The UI, README and synthetic gallery copy were edited with the unslop skill. The full suite passed 19 unit and 23 browser checks after the copy changes. Follow-up wording and screenshot refresh passed the build and both visual checks. See docs/opus-review.md for the two blocked Opus attempts. This is not an Opus-reviewed release.

## 0.2.0 rebuild of the theming engine

Counts and timings in this section replace the 0.1.0 figures above.

Why. The review of 0.1.0 (docs/review-2026-10-23.md) showed with browser probes that theming stalled on pages with more than about 1,000 elements, hover styles froze, oklch() colours were skipped, and Jev decisions were undone by scrolling or any page update.

What changed. The renderer now mirrors the site's own stylesheet rules with mapped colours instead of snapshotting each element. Selectors, media queries and layers are kept, so hover and focus states, CSS variables and later DOM changes follow the site's rules. A pass over the leftovers handles inline styles and colours that stay light. Colour parsing is pure JavaScript for the common syntaxes, with a canvas fallback. Jev decisions persist per page, and in-flight results are discarded only when the page's original look changes. The service worker refuses private-network stylesheet fetches from other origins.

Evidence, 23 October 2026, Chromium 156 from Playwright on macOS:

- 42 unit tests and 36 browser tests pass.
- The new regression tests for hover rules, oklch colours, a 6,000 element page, Jev decision persistence, and an automatic check on a changing page with a slow provider all fail on the 0.1.0 build (commit cbb99a8, same test file) and pass on 0.2.0.
- A 6,000 element page is fully dark in 142 ms on an idle machine. 0.1.0 had themed 883 elements after 30 seconds. With the machine under heavy load (load average 35) the same page took about 3 seconds, so the browser test allows 10 seconds.
- npm audit reports 0 vulnerabilities.

Real websites, loaded with the built extension and checked by eye in screenshots (`node scripts/smoke-real-sites.mjs`):

| Site         | Result                                                                          |
| ------------ | ------------------------------------------------------------------------------- |
| example.com  | Dark through the site's own light-dark() colours once color-scheme is dark      |
| Hacker News  | Rewritten colours. Orange header kept, text readable                            |
| Wikipedia    | Rewritten colours. Dark logo lightened, sticky fade gradients fixed             |
| MDN          | The site resets our theme attribute, so it fell back to rewritten colours. Dark |
| Tailwind CSS | The site's own dark theme                                                       |
| GitHub       | The site's own dark theme                                                       |
| Python docs  | Rewritten colours. Dark                                                         |
| BBC News     | Rewritten colours. Dark. Photos and the ad frame unchanged                      |

Real-site checks also found three bugs the synthetic pages could not: MDN's own script reset our dark attribute and left the page light, some sites remove unknown style tags from the head, and Chrome hides shorthand colours that use variables. Each was fixed with a test.

Not verified: logged-in pages, long infinite-scroll pages, shadow DOM heavy apps such as video sites, other browsers, and live Jev calls.

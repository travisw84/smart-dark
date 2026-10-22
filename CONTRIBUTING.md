# Contributing

Bug reports, "this site looks wrong" reports and pull requests are all welcome.

## Set up

You need Node 22 or newer.

    git clone https://github.com/travisw84/smart-dark.git
    cd smart-dark
    npm ci
    npm run build
    npx playwright install chromium

Load the dist folder in chrome://extensions with Developer mode on. After a rebuild, choose Reload on the extension card and reload the page you are testing.

## Check your change

    npm test            # unit tests
    npm run build
    npm run test:e2e    # loads the built extension in a disposable Chromium profile

npm run check runs all three. The browser tests use synthetic pages and fake credentials. They never use your Chrome profile or a real API key.

The e2e suite also refreshes the screenshots in docs/. If your change did not alter the UI, run git checkout -- docs/*.png before you commit.

## Pull requests

- One change per pull request.
- Add a test that fails without your change. For theming bugs, a small synthetic page in tests/extension.spec.mjs is ideal.
- Run npx prettier --write on the files you edited.
- Write user-facing copy in plain words, with real numbers where you have them.
- Say what you tested by hand, and on which sites.
- A change that adds a permission or sends new data off the device needs a clear reason in the description, and an update to README.md and PRIVACY.md.

## Reporting a site that looks wrong

Use the "A site looks wrong" issue form. A public page address, the theme method, and a screenshot with Smart Dark on and off are enough to start.

## License

Your contribution is released under the MIT license. The code of conduct covers how we talk to each other.

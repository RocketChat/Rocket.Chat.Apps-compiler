# Rocket.Chat.Apps-compiler

The one Compiler to rule them all.

This library provides the core Rocket.Chat App compilation feature for any other tool in the Rocket.Chat ecosystem. It has been extracted from the Apps-Engine so the compilation isn't done during runtime, and for us to support pre-compiled app packages. This has a bunch of benefits [as stated here](https://github.com/RocketChat/Rocket.Chat.Apps-engine/pull/307).

This library exports an `AppsCompiler` class that handles compilation from file system path, and outputs a zip to the file system.

## Configuration

### .rcappsconfig File

You can create a `.rcappsconfig` file in your project root to configure which files should be ignored during compilation and packaging. This file should contain a JSON object with an `ignore` array.

Example `.rcappsconfig`:

```json
{
    "ignore": [
        "*.log",
        "*.tmp",
        "debug/**",
        "temp-*",
        ".env",
        ".env.*",
        "coverage/**",
        "test/**",
        "docs/**",
        ".vscode/**"
    ]
}
```

The ignore patterns support:
- Exact file names: `debug.log`
- Glob patterns: `*.log`, `temp-*`
- Directory patterns: `debug/**`, `node_modules`
- File extensions: `*.tmp`

Files matching these patterns will be excluded from both source compilation and the final package.

## Publishing to NPM

This package is published to NPM using the `@rocket.chat` scope. To publish a new version, you need to have access to the `@rocket.chat` scope on NPM. If you don't have access, ask someone who does to add you to the scope.

Before publishing, make sure you've bumped the package version according to [Semantic Versioning](https://semver.org/) using `npm version [major|minor|patch]`.

To publish a new version, run the following command:

```sh
npm run release
```

Check `package.json` for details on the commands it runs.

After publishing, make sure to create a new tag for the release in the Github repository (make sure to push the bump commit before you do so).

import { expect } from "chai";
import { describe, it } from "mocha";

import { bundleCompilation } from "../src/bundler/esbuild";
import type { AppsEngineValidator } from "../src/compiler/AppsEngineValidator";
import type { ICompilerResult } from "../src/definition";

// The validator is only called for non-relative, non-apps-engine imports.
// Our fixtures only import from apps-engine, so the validator must never fire.
const stubValidator = {
    resolveAppDependencyPath(): never {
        throw new Error("resolveAppDependencyPath should not be called");
    },
} as unknown as AppsEngineValidator;

function makeResult(compiledJs: string): ICompilerResult {
    const file = {
        name: "MyApp.js",
        content: "",
        version: 1,
        compiled: compiledJs,
    };
    return {
        files: { "MyApp.js": file },
        mainFile: file,
        implemented: [],
        diagnostics: [],
        duration: 0,
        name: "MyApp",
        version: "1.0.0",
        typeScriptVersion: "5.0.0",
        permissions: [],
    };
}

describe("bundleCompilation", () => {
    it("keeps @rocket.chat/apps-engine imports as external require calls", async () => {
        const compiledJs = `
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const IApp_1 = require("@rocket.chat/apps-engine/definition/IApp");
exports.MyApp = class MyApp {};
`;
        const { bundle } = await bundleCompilation(
            makeResult(compiledJs),
            stubValidator,
        );

        expect(bundle).to.match(
            /require\(["']@rocket\.chat\/apps-engine\/definition\/IApp["']\)/,
        );
    });

    it("keeps @rocket.chat/apps-engine subpath imports external", async () => {
        const compiledJs = `
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const metadata_1 = require("@rocket.chat/apps-engine/definition/metadata");
exports.MyApp = class MyApp {};
`;
        const { bundle } = await bundleCompilation(
            makeResult(compiledJs),
            stubValidator,
        );

        expect(bundle).to.match(
            /require\(["']@rocket\.chat\/apps-engine\/definition\/metadata["']\)/,
        );
    });

    it("does not inline apps-engine source into the bundle", async () => {
        const compiledJs = `
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const App_1 = require("@rocket.chat/apps-engine/definition/App");
exports.MyApp = class MyApp extends App_1.App {};
`;
        const { bundle } = await bundleCompilation(
            makeResult(compiledJs),
            stubValidator,
        );

        // If apps-engine were bundled, the bundle would be much larger and contain
        // apps-engine internals. As an external dep, only the require() call appears.
        expect(bundle).to.match(
            /require\(["']@rocket\.chat\/apps-engine\/definition\/App["']\)/,
        );
        // A bundled apps-engine would introduce its own internal requires; none should appear
        expect(bundle).to.not.match(
            /require\(["']@rocket\.chat\/apps-engine\/definition\/[^"']+["']\).*require\(["']@rocket\.chat\/apps-engine/s,
        );
    });
});

import * as os from "os";
import path from "path";
import { build, OnLoadArgs, OnResolveArgs, PluginBuild } from "esbuild";

import { ICompilerResult } from "../definition";
import { IBundledCompilerResult } from "../definition/ICompilerResult";
import { AppsEngineValidator } from "../compiler/AppsEngineValidator";

const isWin = os.platform() === "win32";

function normalizeAppModulePath(modulePath: string, parentDir: string): string {
    return /\.\.?\//.test(modulePath)
        ? isWin
            ? path.join(path.dirname(parentDir), modulePath).concat(".js")
            : path
                  .resolve("/", path.dirname(parentDir), modulePath)
                  .substring(1)
                  .concat(".js")
        : modulePath;
}

export async function bundleCompilation(
    r: ICompilerResult,
    validator: AppsEngineValidator
): Promise<IBundledCompilerResult> {
    const buildResult = await build({
        write: false,
        bundle: true,
        minify: true,
        platform: "node",
        target: ["node20"],
        define: {
            "global.Promise": "Promise",
        },
        external: ["@rocket.chat/apps-engine/*"],
        stdin: {
            contents: r.mainFile.compiled,
            sourcefile: r.mainFile.name,
            loader: "js",
        },
        plugins: [
            {
                name: "apps-engine",
                setup(build: PluginBuild) {
                    build.onResolve(
                        { filter: /.*/ },
                        async (args: OnResolveArgs) => {
                            // Let esbuild handle absolute file paths (e.g. node:fs) & initial stdin
                            if (args.namespace === "file") {
                                return;
                            }

                            const isRelative =
                                args.path.startsWith("./") ||
                                args.path.startsWith("../");

                            if (isRelative) {
                                // normalize into the key you used in r.files
                                let modulePath = normalizeAppModulePath(
                                    args.path,
                                    args.importer
                                );
                                modulePath = modulePath
                                    .replace(/^:\\/, "")
                                    .replace(/\\/g, "/");
                                if (r.files[modulePath]) {
                                    return {
                                        namespace: "app-source",
                                        path: modulePath,
                                    };
                                }
                                // maybe they imported a directory
                                const idx =
                                    modulePath.replace(/\.js$/, "") +
                                    "/index.js";
                                if (r.files[idx]) {
                                    return {
                                        namespace: "app-source",
                                        path: idx,
                                    };
                                }
                                // missing internal file → error
                                return {
                                    errors: [
                                        {
                                            text: `Cannot find app file "${modulePath}"`,
                                        },
                                    ],
                                };
                            }

                            // non-relative: try resolving through AppsEngineValidator
                            let nodeModulePath: string | undefined;
                            try {
                                nodeModulePath =
                                    validator.resolveAppDependencyPath(
                                        args.path
                                    );
                            } catch {
                                // resolution failed
                                return {
                                    errors: [
                                        {
                                            text: `Cannot find app dependency "${args.path}"`,
                                        },
                                    ],
                                };
                            }

                            if (
                                nodeModulePath &&
                                typeof nodeModulePath === "string" &&
                                path.isAbsolute(nodeModulePath)
                            ) {
                                return {
                                    namespace: "file",
                                    path: nodeModulePath,
                                };
                            }

                            // for @rocket.chat/apps-engine imports, let esbuild bundle via "file"
                            if (/^@rocket\.chat\/apps-engine/.test(args.path)) {
                                return { namespace: "file", path: args.path };
                            }

                            // otherwise treat as external
                            return { external: true, path: args.path };
                        }
                    );

                    build.onLoad(
                        { filter: /.*/, namespace: "app-source" },
                        (args: OnLoadArgs) => {
                            if (!r.files[args.path]) {
                                return {
                                    errors: [
                                        {
                                            text: `File ${args.path} could not be found`,
                                        },
                                    ],
                                };
                            }

                            return {
                                contents: r.files[args.path].compiled,
                            };
                        }
                    );
                },
            },
        ],
    });

    const [{ text: bundle }] = buildResult.outputFiles;

    return {
        ...r,
        bundle,
    };
}

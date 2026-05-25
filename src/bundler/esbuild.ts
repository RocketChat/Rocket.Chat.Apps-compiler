import path from "path";
import type { OnLoadArgs, OnResolveArgs, PluginBuild } from "esbuild";
import { build } from "esbuild";

import type { ICompilerResult } from "../definition";
import type { IBundledCompilerResult } from "../definition/ICompilerResult";
import type { AppsEngineValidator } from "../compiler/AppsEngineValidator";

function normalizeAppModulePath(modulePath: string, parentDir: string): string {
    const isRelative = /\.\.?\//.test(modulePath);

    if (!isRelative) {
        return modulePath;
    }

    const baseDir = path.posix.dirname(parentDir);
    return `${path.posix.join(baseDir, modulePath)}.js`;
}

export async function bundleCompilation(
    r: ICompilerResult,
    validator: AppsEngineValidator,
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

                            // apps-engine is provided by the host; never bundle it
                            if (
                                /^@rocket\.chat\/apps-engine(?:\/|$)/.test(
                                    args.path,
                                )
                            ) {
                                return { external: true, path: args.path };
                            }

                            const isRelative =
                                args.path.startsWith("./") ||
                                args.path.startsWith("../");

                            if (isRelative) {
                                // normalize into the key you used in r.files
                                const modulePath = normalizeAppModulePath(
                                    args.path,
                                    args.importer,
                                );
                                if (r.files[modulePath]) {
                                    return {
                                        namespace: "app-source",
                                        path: modulePath,
                                    };
                                }
                                // maybe they imported a directory
                                const idx = `${modulePath.replace(
                                    /\.js$/,
                                    "",
                                )}/index.js`;
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
                                        args.path,
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

                            // otherwise treat as external
                            return { external: true, path: args.path };
                        },
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
                        },
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

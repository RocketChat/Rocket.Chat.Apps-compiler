import * as os from 'os';
import path from 'path';
import { build, OnLoadArgs, OnResolveArgs, PluginBuild } from 'esbuild';

import { ICompilerResult } from '../definition';
import { IBundledCompilerResult } from '../definition/ICompilerResult';
import { AppsEngineValidator } from '../compiler/AppsEngineValidator';

const isWin = os.platform() === 'win32';

function normalizeAppModulePath(modulePath: string, parentDir: string): string {
    return /\.\.?\//.test(modulePath)
        ? isWin
            ? path.join(path.dirname(parentDir), modulePath).concat('.js')
            : path.resolve('/', path.dirname(parentDir), modulePath).substring(1).concat('.js')
        : modulePath;
}

export async function bundleCompilation(r: ICompilerResult, validator: AppsEngineValidator): Promise<IBundledCompilerResult> {
    const buildResult = await build({
        write: false,
        bundle: true,
        minify: true,
        platform: 'node',
        target: ['node10'],
        define: {
            'global.Promise': 'Promise',
        },
        external: [
            '@rocket.chat/apps-engine/*',
        ],
        stdin: {
            contents: r.mainFile.compiled,
            sourcefile: r.mainFile.name,
            loader: 'js',
        },
        plugins: [
            {
                name: 'apps-engine',
                setup(build: PluginBuild) {
                    build.onResolve({ filter: /.*/ }, async (args: OnResolveArgs) => {
                        if (args.namespace === 'file') {
                            return;
                        }

                        const modulePath = normalizeAppModulePath(args.path, args.importer);
                        
                        /**
                         * Replace file key, and find for file in `ts` file list.
                         * Files: [..., "endpoints\\SendMessageAsAppUserEndpoint.js"]
                         * ModulePath: ":\\endpoints\\SendMessageAsAppUserEndpoint.js"
                         */
                        const modulePathReplaced = modulePath.replace(":\\", "")
                        const hasFile = !!r.files[modulePathReplaced]

                        if (hasFile) {
                            return {
                                namespace: 'app-source',
                                path: modulePathReplaced,
                            };
                        }

                        if (/\.\.?\//.test(args.path)) {
                            const indexModulePath = modulePath.replace(/\.js$/, `${ path.sep }index.js`);

                            if (r.files[indexModulePath]) {
                                return {
                                    namespace: 'app-source',
                                    path: indexModulePath,
                                };
                            }
                        }

                        const nodeModulePath = validator.resolveAppDependencyPath(args.path);

                        if (!/@rocket\.chat\/apps-engine/.test(args.path) && path.isAbsolute(nodeModulePath)) {
                            return {
                                path: nodeModulePath,
                                namespace: 'file',
                            };
                        }

                        return {
                            path: args.path,
                            external: true,
                        };
                    });

                    build.onLoad({ filter: /.*/, namespace: 'app-source' }, (args: OnLoadArgs) => {
                        if (!r.files[args.path]) {
                            return {
                                errors: [{
                                    text: `File ${ args.path } could not be found`,
                                }],
                            };
                        }

                        return {
                            contents: r.files[args.path].compiled,
                        };
                    });
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

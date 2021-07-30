import { AppsEngineValidator } from '../compiler/AppsEngineValidator';
import { ICompilerResult, IBundledCompilerResult } from '../definition';

import { bundleCompilation as esbuild } from './esbuild';

export enum AvailableBundlers {
    esbuild = 'esbuild'
}

export type BundlerFunction = (compilation: ICompilerResult, validator: AppsEngineValidator) => Promise<IBundledCompilerResult>;

export default function getBundler(name: AvailableBundlers): BundlerFunction {
    switch (name) {
        case AvailableBundlers.esbuild:
            return esbuild;
    }
}

export function isBundled(c: ICompilerResult): c is IBundledCompilerResult {
    return 'bundle' in c;
}

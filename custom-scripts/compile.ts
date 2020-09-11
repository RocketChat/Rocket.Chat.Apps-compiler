import { join, normalize } from 'path';

import { AppsCompiler } from '../src/AppsCompiler';

function getPath() {
    const dir = process.argv[2];
    const resolved = normalize(join(process.cwd(), dir));
    return resolved;
}

(async () => {
    const compiler = new AppsCompiler();
    await compiler.compile(getPath());
    await compiler.outputZip('./testing.zip');
})();

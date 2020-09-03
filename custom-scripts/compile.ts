import { join, normalize } from 'path';

import { AppsCompiler } from '../src/AppsCompiler';

function getPath() {
    const dir = process.argv[2];
    const resolved = normalize(join(__dirname, dir));
    return resolved;
}

(async () => {
    const compiler = new AppsCompiler();
    const diagnostics = await compiler.compile(getPath());

    console.log(diagnostics);
})();

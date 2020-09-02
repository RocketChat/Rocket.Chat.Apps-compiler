import { join, normalize } from 'path';

import { AppsCompiler } from '../src/AppsCompiler';

function getPath() {
    const dir = process.argv[2];
    const resolved = normalize(join(__dirname, dir));
    return resolved;
}

(async () => {
    const compiler = new AppsCompiler();
    const errors = await compiler.compile(getPath());

    const files = compiler.output();

    console.log(errors, files);
})();

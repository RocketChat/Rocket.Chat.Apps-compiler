import path from 'path';

import { compile } from '../src';

const out = path.resolve(process.argv.pop());
const source = path.resolve(process.argv.pop());

compile({
    tool: 'example',
    version: '0.0.1',
    when: new Date(),
}, source, out).then(console.log);

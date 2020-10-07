import { expect } from 'chai';
import { describe, it } from 'mocha';

import { AppsCompiler } from '../src/AppsCompiler';

describe('AppsCompiler', () => {
    it('shouldn\'t throw an error', () => {
        expect(() => new AppsCompiler({
           tool: 'tester',
           version: '0',
        })).not.throw();
    });
});

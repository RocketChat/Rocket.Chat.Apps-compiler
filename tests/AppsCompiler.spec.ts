import { expect } from 'chai';
import { describe, it } from 'mocha';
import * as ts from 'typescript';

import { AppsCompiler } from '../src/AppsCompiler';

describe('AppsCompiler', () => {
    it('shouldn\'t throw an error', () => {
        expect(() => new AppsCompiler({
            tool: 'tester',
            version: '0',
        }, process.cwd(), ts)).not.throw();
    });
});

import { expect } from 'chai';
import { describe, it } from 'mocha';

describe('AppsCompiler', () => {
    it('shouldn\'t throw an error', () => {
        (async () => {
            expect('test holder').equal('test holder');
        })();
    });
});

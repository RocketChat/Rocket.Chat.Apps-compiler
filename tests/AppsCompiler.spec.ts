import { expect } from 'chai';
import { describe, it } from 'mocha';

describe('AppsCompiler', () => {
    it('shouldn\'t throw an error', () => {
        expect(() => new AppsCompiler()).not.throw();
    });
});

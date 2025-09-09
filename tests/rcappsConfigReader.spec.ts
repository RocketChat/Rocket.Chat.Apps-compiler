import { expect } from 'chai';
import { describe, it } from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { 
    readRcappsConfig, 
    mergeIgnorePatterns, 
    shouldIgnoreFile, 
    type IRcappsConfig 
} from '../src/misc/rcappsConfigReader';

describe('rcappsConfigReader', () => {
    let tempDir: string;
    
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcapps-test-'));
    });
    
    afterEach(() => {
        // Clean up temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    describe('readRcappsConfig', () => {
        it('should return null when .rcappsconfig file does not exist', async () => {
            const config = await readRcappsConfig(tempDir);
            expect(config).to.be.null;
        });

        it('should parse valid .rcappsconfig file', async () => {
            const configContent = {
                ignore: ['*.log', 'temp/**', '.env']
            };
            
            fs.writeFileSync(
                path.join(tempDir, '.rcappsconfig'),
                JSON.stringify(configContent)
            );
            
            const config = await readRcappsConfig(tempDir);
            expect(config).to.deep.equal(configContent);
        });

        it('should return null for invalid JSON in .rcappsconfig', async () => {
            fs.writeFileSync(
                path.join(tempDir, '.rcappsconfig'),
                'invalid json content'
            );
            
            const config = await readRcappsConfig(tempDir);
            expect(config).to.be.null;
        });
    });

    describe('mergeIgnorePatterns', () => {
        it('should return default patterns when config is null', () => {
            const defaultPatterns = ['*.ts', '*.js'];
            const result = mergeIgnorePatterns(defaultPatterns, null);
            expect(result).to.deep.equal(defaultPatterns);
        });

        it('should merge default and config patterns', () => {
            const defaultPatterns = ['*.ts', '*.js'];
            const config: IRcappsConfig = {
                ignore: ['*.log', 'temp/**']
            };
            
            const result = mergeIgnorePatterns(defaultPatterns, config);
            expect(result).to.deep.equal(['*.ts', '*.js', '*.log', 'temp/**']);
        });

        it('should handle config without ignore property', () => {
            const defaultPatterns = ['*.ts', '*.js'];
            const config: IRcappsConfig = {};
            
            const result = mergeIgnorePatterns(defaultPatterns, config);
            expect(result).to.deep.equal(defaultPatterns);
        });
    });

    describe('shouldIgnoreFile', () => {
        it('should match exact file paths', () => {
            const patterns = ['src/test.ts', 'config.json'];
            
            expect(shouldIgnoreFile('src/test.ts', patterns)).to.be.true;
            expect(shouldIgnoreFile('config.json', patterns)).to.be.true;
            expect(shouldIgnoreFile('src/main.ts', patterns)).to.be.false;
        });

        it('should match basenames', () => {
            const patterns = ['test.ts', 'config.json'];
            
            expect(shouldIgnoreFile('src/test.ts', patterns)).to.be.true;
            expect(shouldIgnoreFile('deep/nested/config.json', patterns)).to.be.true;
            expect(shouldIgnoreFile('src/main.ts', patterns)).to.be.false;
        });

        it('should match path contains', () => {
            const patterns = ['node_modules', '.git'];
            
            expect(shouldIgnoreFile('node_modules/package/index.js', patterns)).to.be.true;
            expect(shouldIgnoreFile('src/.git/config', patterns)).to.be.true;
            expect(shouldIgnoreFile('src/main.ts', patterns)).to.be.false;
        });

        it('should match simple glob patterns', () => {
            const patterns = ['*.log', '*.tmp', 'test*'];
            
            expect(shouldIgnoreFile('app.log', patterns)).to.be.true;
            expect(shouldIgnoreFile('data.tmp', patterns)).to.be.true;
            expect(shouldIgnoreFile('test-file.js', patterns)).to.be.true;
            expect(shouldIgnoreFile('src/main.ts', patterns)).to.be.false;
        });

        it('should match directory patterns', () => {
            const patterns = ['temp/**', 'build/*'];
            
            expect(shouldIgnoreFile('temp/file.txt', patterns)).to.be.true;
            expect(shouldIgnoreFile('temp/nested/file.txt', patterns)).to.be.true;
            expect(shouldIgnoreFile('build/output.js', patterns)).to.be.true;
            expect(shouldIgnoreFile('src/main.ts', patterns)).to.be.false;
        });
    });
});
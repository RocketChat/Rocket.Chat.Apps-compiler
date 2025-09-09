import { expect } from 'chai';
import { describe, it } from 'mocha';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { getAppSource } from '../../src/compiler/getAppSource';
import { AppPackager } from '../../src/packager/AppPackager';
import { FolderDetails } from '../../src/misc/folderDetails';
import type { ICompilerResult } from '../../src/definition';

describe('RcappsConfig Integration Tests', () => {
    let tempDir: string;
    
    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rcapps-integration-'));
    });
    
    afterEach(() => {
        // Clean up temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should exclude files specified in .rcappsconfig from source compilation', async () => {
        // Create a mock app structure
        const appJsonContent = {
            id: 'test-app',
            name: 'Test App',
            version: '1.0.0',
            classFile: 'main.ts',
            requiredApiVersion: '^1.0.0'
        };
        
        // Create app.json
        fs.writeFileSync(
            path.join(tempDir, 'app.json'),
            JSON.stringify(appJsonContent, null, 2)
        );
        
        // Create main TypeScript file
        fs.writeFileSync(
            path.join(tempDir, 'main.ts'),
            `export class TestApp {
                getName(): string {
                    return 'Test App';
                }
            }`
        );
        
        // Create a file that should be ignored
        fs.writeFileSync(
            path.join(tempDir, 'debug.ts'),
            `export const DEBUG_INFO = 'This should be ignored';`
        );
        
        // Create .rcappsconfig to ignore debug.ts
        const rcappsConfig = {
            ignore: ['debug.ts', '*.log']
        };
        fs.writeFileSync(
            path.join(tempDir, '.rcappsconfig'),
            JSON.stringify(rcappsConfig, null, 2)
        );
        
        // Get app source and verify debug.ts is excluded
        const appSource = await getAppSource(tempDir);
        
        const sourceFileNames = Object.keys(appSource.sourceFiles);
        expect(sourceFileNames).to.include('main.ts');
        expect(sourceFileNames).not.to.include('debug.ts');
    });

    it('should exclude files from packaging based on .rcappsconfig', async () => {
        // Create a mock app structure
        const appJsonContent = {
            id: '12345678-1234-4567-8901-123456789012',
            name: 'Test App',
            nameSlug: 'test-app',
            version: '1.0.0',
            description: 'Test app for integration testing',
            author: {
                name: 'Test Author',
                homepage: 'https://example.com',
                support: 'https://example.com/support'
            },
            classFile: 'main.ts',
            iconFile: 'icon.png',
            requiredApiVersion: '^1.0.0'
        };
        
        // Create app.json
        fs.writeFileSync(
            path.join(tempDir, 'app.json'),
            JSON.stringify(appJsonContent, null, 2)
        );
        
        // Create package.json (required for packaging)
        fs.writeFileSync(
            path.join(tempDir, 'package.json'),
            JSON.stringify({ name: 'test-app', version: '1.0.0' }, null, 2)
        );
        
        // Create icon file (referenced in app.json)
        fs.writeFileSync(path.join(tempDir, 'icon.png'), 'fake png content');
        
        // Create main file
        fs.writeFileSync(
            path.join(tempDir, 'main.ts'),
            'export class TestApp { getName(): string { return "Test App"; } }'
        );
        
        // Create files that should be ignored
        fs.writeFileSync(path.join(tempDir, 'debug.log'), 'debug information');
        fs.writeFileSync(path.join(tempDir, 'temp-file.txt'), 'temporary data');
        
        // Create .rcappsconfig
        const rcappsConfig = {
            ignore: ['*.log', 'temp-*']
        };
        fs.writeFileSync(
            path.join(tempDir, '.rcappsconfig'),
            JSON.stringify(rcappsConfig, null, 2)
        );
        
        // Test the glob options generation
        const folderDetails = new FolderDetails(tempDir);
        await folderDetails.readInfoFile();
        
        const mockCompilerResult: ICompilerResult = {
            files: {
                'main.ts': { 
                    compiled: 'mock compiled content',
                    name: 'main.ts',
                    content: 'mock content',
                    version: 0
                }
            },
            diagnostics: [],
            duration: 100,
            implemented: [],
            name: 'test-app',
            version: '1.0.0',
            typeScriptVersion: '5.0.0'
        };
        
        const packager = new AppPackager(
            { tool: 'test', version: '1.0.0' },
            folderDetails,
            mockCompilerResult,
            path.join(tempDir, 'output.zip')
        );
        
        // Access the private method for testing by casting to any
        const globOptions = await (packager as any).getGlobOptions();
        
        // Verify that our custom ignore patterns are included
        expect(globOptions.ignore).to.include('*.log');
        expect(globOptions.ignore).to.include('temp-*');
        
        // Verify default patterns are still there
        expect(globOptions.ignore).to.include('**/*.ts');
        expect(globOptions.ignore).to.include('**/.*');
    });
});
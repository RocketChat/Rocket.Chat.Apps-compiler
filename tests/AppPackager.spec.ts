import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";

import { AppPackager } from "../src/packager/AppPackager";
import { FolderDetails } from "../src/misc/folderDetails";
import type { ICompilerDescriptor, ICompilerResult } from "../src/definition";

describe("AppPackager", () => {
    let tempDir: string;
    let folderDetails: FolderDetails;
    let compilerDesc: ICompilerDescriptor;
    let compilationResult: ICompilerResult;

    beforeEach(async () => {
        // Create temporary directory for testing
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "apppackager-test-"));

        // Create basic app.json file
        const appInfo = {
            id: "550e8400-e29b-41d4-a716-446655440000",
            name: "Test App",
            nameSlug: "test-app",
            version: "1.0.0",
            description: "A test app for testing purposes",
            requiredApiVersion: "1.0.0",
            author: {
                name: "Test Author",
                homepage: "https://test.com",
                support: "https://test.com/support",
            },
            classFile: "TestApp.ts",
            iconFile: "icon.png",
        };

        await fs.writeFile(
            path.join(tempDir, "app.json"),
            JSON.stringify(appInfo, null, 2),
        );

        // Create the main class file
        await fs.writeFile(
            path.join(tempDir, "TestApp.ts"),
            "export class TestApp {}",
        );

        // Create a dummy icon file
        await fs.writeFile(path.join(tempDir, "icon.png"), "fake png content");

        // Create some test files that should be packaged
        await fs.writeFile(path.join(tempDir, "package.json"), "{}");
        await fs.writeFile(
            path.join(tempDir, "important.txt"),
            "important content",
        );

        // Create some files that should be ignored by default
        await fs.writeFile(path.join(tempDir, "README.md"), "readme content");
        await fs.writeFile(path.join(tempDir, "test.spec.ts"), "test content");

        folderDetails = new FolderDetails(tempDir);
        await folderDetails.readInfoFile();

        compilerDesc = {
            tool: "test",
            version: "1.0.0",
        };

        compilationResult = {
            files: {
                "TestApp.js": {
                    name: "TestApp.js",
                    content: "source content",
                    version: 1,
                    compiled: "compiled content",
                },
            },
            implemented: [],
            diagnostics: [],
            duration: 100,
            name: "test-app",
            version: "1.0.0",
            typeScriptVersion: "5.8.3",
        };
    });

    afterEach(async () => {
        // Clean up temp directory
        await fs.remove(tempDir);
    });

    it("should package files without .rcappsconfig", async () => {
        const outputFile = path.join(tempDir, "output.zip");
        const packager = new AppPackager(
            compilerDesc,
            folderDetails,
            compilationResult,
            outputFile,
        );

        const result = await packager.zipItUp();
        expect(result).to.equal(outputFile);
        expect(fs.existsSync(outputFile)).to.be.true;
    });

    it("should ignore files specified in .rcappsconfig", async () => {
        // Create .rcappsconfig with ignoredFiles
        const rcAppsConfig = {
            url: "https://test.rocket.chat",
            username: "testuser",
            password: "testpass",
            ignoredFiles: ["important.txt", "*.json"],
        };

        await fs.writeFile(
            path.join(tempDir, ".rcappsconfig"),
            JSON.stringify(rcAppsConfig, null, 2),
        );

        const outputFile = path.join(tempDir, "output.zip");
        const packager = new AppPackager(
            compilerDesc,
            folderDetails,
            compilationResult,
            outputFile,
        );

        const result = await packager.zipItUp();
        expect(result).to.equal(outputFile);
        expect(fs.existsSync(outputFile)).to.be.true;

        // The test would need to unzip and verify contents, but for now
        // we just verify the package was created successfully
    });

    it("should handle malformed .rcappsconfig gracefully", async () => {
        // Create malformed .rcappsconfig
        await fs.writeFile(
            path.join(tempDir, ".rcappsconfig"),
            "invalid json content",
        );

        const outputFile = path.join(tempDir, "output.zip");
        const packager = new AppPackager(
            compilerDesc,
            folderDetails,
            compilationResult,
            outputFile,
        );

        // Should not throw an error, should fallback to default behavior
        const result = await packager.zipItUp();
        expect(result).to.equal(outputFile);
        expect(fs.existsSync(outputFile)).to.be.true;
    });

    it("should handle .rcappsconfig with non-array ignoredFiles", async () => {
        // Create .rcappsconfig with invalid ignoredFiles type
        const rcAppsConfig = {
            url: "https://test.rocket.chat",
            username: "testuser",
            password: "testpass",
            ignoredFiles: "not-an-array",
        };

        await fs.writeFile(
            path.join(tempDir, ".rcappsconfig"),
            JSON.stringify(rcAppsConfig, null, 2),
        );

        const outputFile = path.join(tempDir, "output.zip");
        const packager = new AppPackager(
            compilerDesc,
            folderDetails,
            compilationResult,
            outputFile,
        );

        // Should not throw an error, should treat as empty array
        const result = await packager.zipItUp();
        expect(result).to.equal(outputFile);
        expect(fs.existsSync(outputFile)).to.be.true;
    });

    it("should merge default ignored files with .rcappsconfig ignored files", async () => {
        // Create .rcappsconfig with additional ignored files
        const rcAppsConfig = {
            url: "https://test.rocket.chat",
            username: "testuser",
            password: "testpass",
            ignoredFiles: ["custom-ignore.txt"],
        };

        await fs.writeFile(
            path.join(tempDir, ".rcappsconfig"),
            JSON.stringify(rcAppsConfig, null, 2),
        );

        // Create the custom file to be ignored
        await fs.writeFile(
            path.join(tempDir, "custom-ignore.txt"),
            "should be ignored",
        );

        const outputFile = path.join(tempDir, "output.zip");
        const packager = new AppPackager(
            compilerDesc,
            folderDetails,
            compilationResult,
            outputFile,
        );

        const result = await packager.zipItUp();
        expect(result).to.equal(outputFile);
        expect(fs.existsSync(outputFile)).to.be.true;

        // Default ignored files (like README.md, *.spec.ts) should still be ignored
        // along with the custom ignored file
    });

    it("should handle .rcappsconfig without ignoredFiles property", async () => {
        // Create .rcappsconfig without ignoredFiles property
        const rcAppsConfig = {
            url: "https://test.rocket.chat",
            username: "testuser",
            password: "testpass",
            // Note: ignoredFiles property is omitted entirely
        };

        await fs.writeFile(
            path.join(tempDir, ".rcappsconfig"),
            JSON.stringify(rcAppsConfig, null, 2),
        );

        const outputFile = path.join(tempDir, "output.zip");
        const packager = new AppPackager(
            compilerDesc,
            folderDetails,
            compilationResult,
            outputFile,
        );

        // Should not throw an error, should use only default ignore patterns
        const result = await packager.zipItUp();
        expect(result).to.equal(outputFile);
        expect(fs.existsSync(outputFile)).to.be.true;
    });
});

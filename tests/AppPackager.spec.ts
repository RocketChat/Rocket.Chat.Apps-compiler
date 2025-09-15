import { expect } from "chai";
import { describe, it, beforeEach, afterEach } from "mocha";
import * as fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import * as yauzl from "yauzl";

import { AppPackager } from "../src/packager/AppPackager";
import { FolderDetails } from "../src/misc/folderDetails";
import type { ICompilerDescriptor, ICompilerResult } from "../src/definition";

describe("AppPackager", () => {
    let tempDir: string;
    let folderDetails: FolderDetails;
    let compilerDesc: ICompilerDescriptor;
    let compilationResult: ICompilerResult;

    // Helper function to extract zip file contents and return list of file names
    async function getZipFileList(zipPath: string): Promise<string[]> {
        return new Promise((resolve, reject) => {
            const fileList: string[] = [];

            yauzl.open(zipPath, { lazyEntries: true }, (err, zipfile) => {
                if (err) {
                    reject(err);
                    return;
                }

                zipfile.readEntry();
                zipfile.on("entry", (entry) => {
                    // Skip directories
                    if (!entry.fileName.endsWith("/")) {
                        fileList.push(entry.fileName);
                    }
                    zipfile.readEntry();
                });

                zipfile.on("end", () => {
                    resolve(fileList);
                });

                zipfile.on("error", (error) => {
                    reject(error);
                });
            });
        });
    }

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
        await fs.writeFile(
            path.join(tempDir, "should-be-included.txt"),
            "should be included",
        );

        // Create some files that should be ignored by default
        await fs.writeFile(path.join(tempDir, "README.md"), "readme content");
        await fs.writeFile(path.join(tempDir, "test.spec.ts"), "test content");

        // Create additional test files for custom ignore patterns
        await fs.writeFile(
            path.join(tempDir, "debug.log"),
            "debug log content",
        );
        await fs.writeFile(path.join(tempDir, "config.json"), '{"test": true}');

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

        // Verify that without .rcappsconfig, only default ignore patterns are applied
        const zipContents = await getZipFileList(outputFile);

        // Files that should be ignored by default patterns
        expect(zipContents).to.not.include(
            "README.md",
            "README.md should be ignored by default",
        );
        expect(zipContents).to.not.include(
            "test.spec.ts",
            "test.spec.ts should be ignored by default",
        );

        // Files that would be ignored by custom patterns but should be included without .rcappsconfig
        expect(zipContents).to.include(
            "important.txt",
            "important.txt should be included without custom ignore",
        );
        expect(zipContents).to.include(
            "debug.log",
            "debug.log should be included without custom ignore",
        );
        expect(zipContents).to.include(
            "config.json",
            "config.json should be included without custom ignore",
        );

        // Files that should always be included
        expect(zipContents).to.include(
            "should-be-included.txt",
            "should-be-included.txt should be included",
        );
        expect(zipContents).to.include(
            "package.json",
            "package.json should be included",
        );
        expect(zipContents).to.include(
            "icon.png",
            "icon.png should be included",
        );
    });

    it("should ignore files specified in .rcappsconfig", async () => {
        // Create .rcappsconfig with ignoredFiles
        const rcAppsConfig = {
            url: "https://test.rocket.chat",
            username: "testuser",
            password: "testpass",
            ignoredFiles: [
                "important.txt", // Should ignore this specific file
                "*.log", // Should ignore all .log files
                "config.json", // Should ignore this specific JSON file
            ],
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

        // Verify zip contents to ensure custom ignore patterns are respected
        const zipContents = await getZipFileList(outputFile);

        // Files that should be ignored (custom patterns)
        expect(zipContents).to.not.include(
            "important.txt",
            "important.txt should be ignored by custom pattern",
        );
        expect(zipContents).to.not.include(
            "debug.log",
            "debug.log should be ignored by *.log pattern",
        );
        expect(zipContents).to.not.include(
            "config.json",
            "config.json should be ignored by custom pattern",
        );

        // Files that should be ignored by default patterns
        expect(zipContents).to.not.include(
            "README.md",
            "README.md should be ignored by default",
        );
        expect(zipContents).to.not.include(
            "test.spec.ts",
            "test.spec.ts should be ignored by default",
        );
        expect(zipContents).to.not.include(
            ".rcappsconfig",
            ".rcappsconfig should be ignored by default (.*) pattern",
        );

        // Files that should be included
        expect(zipContents).to.include(
            "should-be-included.txt",
            "should-be-included.txt should be included",
        );
        expect(zipContents).to.include(
            "package.json",
            "package.json should be included (not matching config.json)",
        );
        expect(zipContents).to.include(
            "icon.png",
            "icon.png should be included",
        );

        // Compiled files should be included
        expect(zipContents).to.include(
            "TestApp.js",
            "Compiled file should be included",
        );
        expect(zipContents).to.include(
            ".packagedby",
            "Metadata file should be included",
        );
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

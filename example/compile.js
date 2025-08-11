const path = require('path');

const { compile } = require('../dist');

// Extract arguments (skip node and script path)
const args = process.argv.slice(2);

if (args.length < 2 || args.length > 3) {
	console.error('Usage: node compile.js <sourceDir> <outputFile> [useNativeCompiler]');
	process.exit(1);
}

const [sourceArg, outputArg, nativeCompilerArg] = args;

const source = path.resolve(sourceArg);
const out = path.resolve(outputArg);

// Convert string to boolean (treat 'true', '1', etc. as true)
const useNativeCompiler = nativeCompilerArg
	? ['true', '1', 'yes'].includes(nativeCompilerArg.toLowerCase())
	: false;

compile(
	{
		tool: 'example',
		version: '0.0.1',
		when: new Date(),
	},
	source,
	out,
	useNativeCompiler,
).then(console.log).catch((err) => {
	console.error('Compilation failed:', err);
	process.exit(1);
});

// import * as ts from 'typescript';
import AppsCompiler from './src/AppsCompiler';

(async () => {
    const payloadDir = `${ __dirname }/payloads`;

    const compiler = new AppsCompiler();
    const { classFile } = await import(`${ payloadDir }/app-2/appsinfo.json`);
    const files = await import(`${ payloadDir }/app-2/files.json`);

    const js = compiler.toJs({
        files,
        classFile: files[classFile].content, // yeah... ImSoClEvEr
    });

    console.log(JSON.stringify(js));
})();

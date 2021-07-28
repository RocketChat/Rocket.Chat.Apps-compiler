import { build, OnLoadArgs, OnResolveArgs, PluginBuild } from 'esbuild';

import { ICompilerResult } from '../definition';
import { IBundledCompilerResult } from '../definition/ICompilerResult';

export async function bundleCompilation(r: ICompilerResult): Promise<IBundledCompilerResult> {
    const buildResult = await build({
        write: false,
        bundle: true,
        platform: 'node',
        target: ['node10'],
        minify: true,
        external: [
            '@rocket.chat/apps-engine/*',
        ],
        stdin: {
            contents: r.mainFile.compiled,
            sourcefile: r.mainFile.name,
        },
        plugins: [
            {
                name: 'apps-engine',
                setup(build: PluginBuild) {
                    build.onResolve({ filter: /.*/ }, (args: OnResolveArgs) => {
                        const path = args.path.startsWith('./')
                            ? args.path.replace(/^\.\//, '').concat('.js')
                            : args.path;

                        if (r.files[path]) {
                            return {
                                namespace: 'apps-engine.app-source',
                                path,
                            };
                        }
                    });

                    build.onLoad({ filter: /.*/, namespace: 'apps-engine.app-source' }, (args: OnLoadArgs) => {
                        if (!r.files[args.path]) {
                            return {
                                errors: [{
                                    text: `File ${ args.path } could not be found`,
                                }],
                            };
                        }

                        return {
                            contents: r.files[args.path].compiled,
                        };
                    });
                },
            },
        ],
    });

    console.log(buildResult);

    const [{ text: bundle }] = buildResult.outputFiles;

    return {
        ...r,
        bundle,
    };
}

const compilerResult: ICompilerResult = {
    files: {
        'BrazilianZipCodeLookupApp.js': {
            content: 'import {\n'
        + '    IAppAccessors,\n'
        + '    IConfigurationExtend,\n'
        + '    ILogger,\n'
        + "} from '@rocket.chat/apps-engine/definition/accessors';\n"
        + "import { App } from '@rocket.chat/apps-engine/definition/App';\n"
        + "import { IAppInfo } from '@rocket.chat/apps-engine/definition/metadata';\n"
        + "import { CEPCommand } from './slashcommands/CEP';\n"
        + '\n'
        + 'export class BrazilianZipCodeLookupApp extends App {\n'
        + '    constructor(info: IAppInfo, logger: ILogger, accessors: IAppAccessors) {\n'
        + '        super(info, logger, accessors);\n'
        + '    }\n'
        + '\n'
        + '    protected async extendConfiguration(configuration: IConfigurationExtend): Promise<void> {\n'
        + '        configuration.slashCommands.provideSlashCommand(new CEPCommand(this));\n'
        + '    }\n'
        + '}\n',
            name: 'BrazilianZipCodeLookupApp.js',
            version: 0,
            compiled: '"use strict";\r\n'
        + 'Object.defineProperty(exports, "__esModule", { value: true });\r\n'
        + 'exports.BrazilianZipCodeLookupApp = void 0;\r\n'
        + 'const App_1 = require("@rocket.chat/apps-engine/definition/App");\r\n'
        + 'const CEP_1 = require("./slashcommands/CEP");\r\n'
        + 'class BrazilianZipCodeLookupApp extends App_1.App {\r\n'
        + '    constructor(info, logger, accessors) {\r\n'
        + '        super(info, logger, accessors);\r\n'
        + '    }\r\n'
        + '    async extendConfiguration(configuration) {\r\n'
        + '        configuration.slashCommands.provideSlashCommand(new CEP_1.CEPCommand(this));\r\n'
        + '    }\r\n'
        + '}\r\n'
        + 'exports.BrazilianZipCodeLookupApp = BrazilianZipCodeLookupApp;\r\n',
        },
        'slashcommands/CEP.js': {
            content: 'import { IHttp, IModify, IPersistence, IRead } from "@rocket.chat/apps-engine/definition/accessors";\n'
        + 'import { App } from "@rocket.chat/apps-engine/definition/App";\n'
        + 'import { ISlashCommand, SlashCommandContext } from "@rocket.chat/apps-engine/definition/slashcommands";\n'
        + '\n'
        + 'export class CEPCommand implements ISlashCommand {\n'
        + '    public command: string;\n'
        + '    public i18nParamsExample: string;\n'
        + '    public i18nDescription: string;\n'
        + '    public providesPreview: boolean;\n'
        + '\n'
        + '    constructor(private readonly app: App) {\n'
        + "        this.command = 'cep';\n"
        + "        this.i18nParamsExample = 'cep-command-example';\n"
        + "        this.i18nDescription = 'cep-command-description';\n"
        + '        this.providesPreview = false;\n'
        + '    };\n'
        + '\n'
        + '    public async executor(context: SlashCommandContext, read: IRead, modify: IModify, http: IHttp, persis: IPersistence): Promise<void> {\n'
        + '        const message = await modify.getCreator().startMessage();\n'
        + '\n'
        + '        const room = context.getRoom();\n'
        + "        const sender = await read.getUserReader().getById('rocket.cat');\n"
        + '        const args = context.getArguments();\n'
        + '\n'
        + "        let messageText='';\n"
        + '        if(!args[0]){\n'
        + "            messageText = 'Please provide a valid Zip Code';\n"
        + '        } else {\n'
        + '            let response = await http.get(`https://viacep.com.br/ws/${args[0]}/json/`,{\n'
        + '                headers: {\n'
        + "                    'Content-Type': 'application/json'\n"
        + '                }\n'
        + '            });\n'
        + '\n'
        + '            if(response.statusCode != 200){\n'
        + "                messageText = 'Invalid Zip Code or API Error';\n"
        + '            } else {\n'
        + '\n'
        + "                let address = JSON.parse(response.content+'');\n"
        + '\n'
        + "                let textAddress = 'CEP ' + args[0] + '\\n';\n"
        + '\n'
        + "                textAddress += address.logradouro ? address.logradouro+'\\n':'';\n"
        + "                textAddress += address.bairro ? address.bairro+'\\n':'';\n"
        + "                textAddress += address.localidade ? address.localidade + ' - ' + address.uf:'';\n"
        + '                messageText = textAddress;\n'
        + '            }\n'
        + '        }\n'
        + '\n'
        + '        if (!room) {\n'
        + "            throw new Error('No room is configured for the message');\n"
        + '        }\n'
        + '\n'
        + '        message\n'
        + '            .setSender(sender)\n'
        + '            .setRoom(room)\n'
        + '            .setText(messageText);\n'
        + '\n'
        + '        modify.getCreator().finish(message);\n'
        + '        //modify.getNotifier().notifyRoom(room, message.getMessage());\n'
        + '    }\n'
        + '}\n'
        + '\n',
            name: 'slashcommands/CEP.js',
            version: 0,
            compiled: '"use strict";\r\n'
        + 'Object.defineProperty(exports, "__esModule", { value: true });\r\n'
        + 'exports.CEPCommand = void 0;\r\n'
        + 'class CEPCommand {\r\n'
        + '    constructor(app) {\r\n'
        + '        this.app = app;\r\n'
        + "        this.command = 'cep';\r\n"
        + "        this.i18nParamsExample = 'cep-command-example';\r\n"
        + "        this.i18nDescription = 'cep-command-description';\r\n"
        + '        this.providesPreview = false;\r\n'
        + '    }\r\n'
        + '    ;\r\n'
        + '    async executor(context, read, modify, http, persis) {\r\n'
        + '        const message = await modify.getCreator().startMessage();\r\n'
        + '        const room = context.getRoom();\r\n'
        + "        const sender = await read.getUserReader().getById('rocket.cat');\r\n"
        + '        const args = context.getArguments();\r\n'
        + "        let messageText = '';\r\n"
        + '        if (!args[0]) {\r\n'
        + "            messageText = 'Please provide a valid Zip Code';\r\n"
        + '        }\r\n'
        + '        else {\r\n'
        + '            let response = await http.get(`https://viacep.com.br/ws/${args[0]}/json/`, {\r\n'
        + '                headers: {\r\n'
        + "                    'Content-Type': 'application/json'\r\n"
        + '                }\r\n'
        + '            });\r\n'
        + '            if (response.statusCode != 200) {\r\n'
        + "                messageText = 'Invalid Zip Code or API Error';\r\n"
        + '            }\r\n'
        + '            else {\r\n'
        + "                let address = JSON.parse(response.content + '');\r\n"
        + "                let textAddress = 'CEP ' + args[0] + '\\n';\r\n"
        + "                textAddress += address.logradouro ? address.logradouro + '\\n' : '';\r\n"
        + "                textAddress += address.bairro ? address.bairro + '\\n' : '';\r\n"
        + "                textAddress += address.localidade ? address.localidade + ' - ' + address.uf : '';\r\n"
        + '                messageText = textAddress;\r\n'
        + '            }\r\n'
        + '        }\r\n'
        + '        if (!room) {\r\n'
        + "            throw new Error('No room is configured for the message');\r\n"
        + '        }\r\n'
        + '        message\r\n'
        + '            .setSender(sender)\r\n'
        + '            .setRoom(room)\r\n'
        + '            .setText(messageText);\r\n'
        + '        modify.getCreator().finish(message);\r\n'
        + '    }\r\n'
        + '}\r\n'
        + 'exports.CEPCommand = CEPCommand;\r\n',
        },
    },
    implemented: [],
    diagnostics: [],
    duration: 3304,
    name: 'Brazilian Zip Code Lookup',
    version: '1.0.2',
    typeScriptVersion: '4.3.5',
    permissions: [{ name: 'slashcommand' }],
};

compilerResult.mainFile = compilerResult.files['BrazilianZipCodeLookupApp.js'];

// bundleCompilation(compilerResult).then(console.log);

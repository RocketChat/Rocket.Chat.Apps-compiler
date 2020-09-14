# Rocket.Chat.Apps-compiler

The one Compiler to rule them all.

This library provides the core Rocket.Chat App compilation feature for any other tool in the Rocket.Chat ecosystem. It has been extracted from the Apps-Engine so the compilation isn't done during runtime, and for us to support pre-compiled app packages. This has a bunch of benefits [as stated here](https://github.com/RocketChat/Rocket.Chat.Apps-engine/pull/307).

This library exports an `AppsCompiler` class that handles compilation from file system path, and outputs a zip to the file system.

## CLI

There is also a custom script that can be called from the CLI to compile an app in a specific directory. To use this feature, you'll first need to clone this repository and install its dependencies:

```
$ git clone git@github.com:RocketChat/Rocket.Chat.Apps-compiler.git
$ cd Rocket.Chat.Apps-compiler
$ npm i
$ npm run compile -- [-s|--sourceDir] <path/to/rocketchat/app/dir> [-o|--outputFile] <path/to/compiled/package.zip>
```

**IMPORTANT**: note that `-o` flag is for the *output FILE*, so make sure to specify the name of the zip file, not simply the path.

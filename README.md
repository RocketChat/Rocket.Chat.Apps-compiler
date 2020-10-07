# Rocket.Chat.Apps-compiler

The one Compiler to rule them all.

This library provides the core Rocket.Chat App compilation feature for any other tool in the Rocket.Chat ecosystem. It has been extracted from the Apps-Engine so the compilation isn't done during runtime, and for us to support pre-compiled app packages. This has a bunch of benefits [as stated here](https://github.com/RocketChat/Rocket.Chat.Apps-engine/pull/307).

This library exports an `AppsCompiler` class that handles compilation from file system path, and outputs a zip to the file system.

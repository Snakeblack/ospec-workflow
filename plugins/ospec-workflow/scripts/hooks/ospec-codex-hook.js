#!/usr/bin/env node

"use strict";

// Set per-invocation host markers in this process, independently of the shell
// Codex uses to launch command hooks (cmd, PowerShell, or a POSIX shell).
// The shared launcher retains native-binary selection and output adaptation.
process.env.OSPEC_TARGET = "codex";
process.env.OSPEC_CODEX_WRAPPER = "1";
process.exitCode = require("./ospec-hooks-launch.js").main(process.argv.slice(2));

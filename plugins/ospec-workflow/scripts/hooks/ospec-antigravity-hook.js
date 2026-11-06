#!/usr/bin/env node

"use strict";

// Set the host marker in this process, independently of the shell agy uses to
// launch command hooks (`sh -c` or `cmd /c`). The shared launcher adapts agy's
// stdin and output and keeps native-binary selection.
process.env.OSPEC_TARGET = "antigravity";
process.exitCode = require("./ospec-hooks-launch.js").main(process.argv.slice(2));

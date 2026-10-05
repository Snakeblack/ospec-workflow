#!/usr/bin/env node
"use strict";

process.exitCode = require("../src/cli.js").run(process.argv.slice(2));

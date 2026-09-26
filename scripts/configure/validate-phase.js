#!/usr/bin/env node
"use strict";

// Preserve the source-repository command while the generated runtime uses the
// distributed entry point directly.
require("../validate-phase.js").main();

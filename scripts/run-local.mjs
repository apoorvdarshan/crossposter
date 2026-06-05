#!/usr/bin/env node
process.env.CROSSPOSTER_NO_OPEN ||= "true";

await import("../bin/crossposter.mjs");

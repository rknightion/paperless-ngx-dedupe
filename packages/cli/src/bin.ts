#!/usr/bin/env node --import tsx/esm

import { program } from './cli.js';

program.parseAsync(process.argv);

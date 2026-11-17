#!/usr/bin/env node
import fs from 'node:fs';
import { runCli } from '../dist/cli.js';

if (fs.existsSync('.env')) process.loadEnvFile('.env');
process.exitCode = await runCli(process.argv.slice(2), { env: process.env, print: (line) => console.log(line) });

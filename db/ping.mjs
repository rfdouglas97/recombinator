#!/usr/bin/env node
import { pingDatabase, closePool } from './client.mjs';

const info = await pingDatabase();
console.log('OK', info);
await closePool();

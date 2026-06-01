#!/bin/bash
# ArcBank Liquidation Bot — startup script for PM2
# Uses --transpile-only to skip TypeScript type checking at runtime
exec /usr/bin/ts-node --transpile-only -P /root/arcbank/tsconfig.hardhat.json /root/arcbank/agents/liquidation-bot.ts

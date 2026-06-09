#!/bin/bash
# AgentLoan Protocol Manager — startup script for PM2
exec /usr/bin/ts-node --transpile-only -P /root/arcbank/tsconfig.hardhat.json /root/arcbank/agents/protocol-manager.ts

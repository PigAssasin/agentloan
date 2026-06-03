#!/bin/bash
# AgentLoan Coordinator Agent — startup script for PM2
exec /usr/bin/ts-node --transpile-only -P /root/arcbank/tsconfig.hardhat.json /root/arcbank/agents/coordinator-agent.ts

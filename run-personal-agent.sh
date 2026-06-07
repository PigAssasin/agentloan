#!/bin/bash
exec /usr/bin/ts-node --transpile-only -P /root/arcbank/tsconfig.hardhat.json /root/arcbank/agents/personal-agent.ts

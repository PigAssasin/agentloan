#!/bin/bash
cd /root/arcbank
npx ts-node --project tsconfig.hardhat.json agents/personal-agent.ts

# /commit

Analyze the current git diff and write a conventional commit message.

## Steps
1. Run `git diff --staged` to see staged changes
2. Identify the type: feat | fix | chore | docs | refactor | test | security
3. Identify the scope: contract | frontend | api | config | deps
4. Write message: `type(scope): concise description`

## Rules
- Subject line max 72 chars
- Use imperative mood ("add" not "added")
- If contracts changed, append `[CONTRACT CHANGE]` to subject
- Body: explain WHY, not WHAT (the diff shows what)

## Example
```
feat(contract): add liquidation threshold parameter

Allows governance to adjust liquidation thresholds per asset
without redeploying the core lending pool contract.
```

Run: `git commit -m "$(generated message)"`

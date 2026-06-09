#!/bin/bash
# One-shot deploy script for Protocol Manager on VPS
# Run: bash /root/arcbank/scripts/deploy-protocol-manager.sh

set -e
cd /root/arcbank

echo "=== Protocol Manager Deploy ==="
echo ""

# 1. Check RAM
FREE_MB=$(free -m | awk '/^Mem:/{print $7}')
echo "[1] Available RAM: ${FREE_MB}MB"
if [ "$FREE_MB" -lt 150 ]; then
  echo "    WARNING: Low RAM. Stopping coordinator first..."
fi

# 2. Stop coordinator-agent
echo "[2] Stopping coordinator-agent..."
pm2 stop coordinator-agent 2>/dev/null && echo "    Stopped." || echo "    Not running (ok)."
sleep 2

# 3. Pull latest code
echo "[3] Pulling latest code..."
git pull origin main

# 4. Start protocol-manager
echo "[4] Starting Protocol Manager..."
pm2 start ecosystem.config.js --only protocol-manager
echo "    Waiting 25s for oracle push..."
sleep 25

# 5. Verify oracle push before restarting bot
echo "[5] Checking oracle push..."
ORACLE_LINE=$(pm2 logs protocol-manager --lines 30 --nostream 2>/dev/null | grep "\[oracle\] pushed" | tail -1)
if [ -z "$ORACLE_LINE" ]; then
  echo ""
  echo "    ERROR: No oracle push detected after 25s!"
  echo "    Check logs: pm2 logs protocol-manager --lines 50"
  echo "    NOT restarting bot. Fix PM first."
  exit 1
fi
echo "    Oracle confirmed: $ORACLE_LINE"

# 6. Restart bot (oracle now covered by PM)
echo "[6] Restarting liquidation bot..."
pm2 restart arcbank-bot
sleep 5

# 7. Verify bot is NOT pushing oracle
BOT_PUSH=$(pm2 logs arcbank-bot --lines 10 --nostream 2>/dev/null | grep "oracle stale, updating")
if [ -n "$BOT_PUSH" ]; then
  echo "    WARNING: Bot still pushing oracle — may need another restart."
fi

# 8. Save PM2 config
pm2 save

# 9. Final status
echo ""
echo "=== Final Status ==="
pm2 status
echo ""
free -m | awk '/^Mem:/{printf "RAM: %dMB used / %dMB total / %dMB free\n", $3, $2, $7}'
echo ""
echo "=== Verify ==="
echo "  pm2 logs protocol-manager --lines 20   (should see [oracle], [coordinator], [health])"
echo "  pm2 logs arcbank-bot --lines 10        (should NOT see 'oracle stale, updating')"
echo ""
echo "Done!"

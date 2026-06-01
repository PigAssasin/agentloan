"""
VPS deploy script for ArcBank Liquidation Bot.
Runs all setup commands in one persistent SSH session.
"""
import paramiko
import sys
import time

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST = "167.71.216.36"
USER = "root"
PASS = "QLHUgbpT!m3HTxD"

def connect():
    for i in range(5):
        try:
            c = paramiko.SSHClient()
            c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            c.connect(HOST, username=USER, password=PASS, timeout=30, banner_timeout=60, auth_timeout=30)
            print(f"Connected (attempt {i+1})")
            return c
        except Exception as e:
            print(f"Attempt {i+1} failed: {e}")
            time.sleep(4)
    raise RuntimeError("Cannot connect")

def run(client, cmd, timeout=300):
    print(f"\n>>> {cmd[:100]}")
    chan = client.get_transport().open_session()
    chan.settimeout(timeout)
    chan.exec_command(cmd)

    out = b""
    err = b""
    while True:
        if chan.recv_ready():
            out += chan.recv(4096)
        if chan.recv_stderr_ready():
            err += chan.recv_stderr(4096)
        if chan.exit_status_ready():
            # Drain remaining
            while chan.recv_ready():
                out += chan.recv(4096)
            while chan.recv_stderr_ready():
                err += chan.recv_stderr(4096)
            break
        time.sleep(0.1)

    result = (out + err).decode('utf-8', 'replace').strip()
    if result:
        print(result[-800:])
    return result, chan.recv_exit_status()

client = connect()

# Step 1: Check state
print("\n=== STEP 1: Check repo ===")
out, _ = run(client, "ls /root/arcbank/ 2>/dev/null && echo HAS_REPO || echo NO_REPO")

if "NO_REPO" in out or "package.json" not in run(client, "ls /root/arcbank/")[0]:
    print("\n=== Cloning repo ===")
    run(client, "rm -rf /root/arcbank && git clone https://github.com/PigAssasin/arcbank.git /root/arcbank", timeout=120)
else:
    print("\n=== Pulling latest ===")
    run(client, "cd /root/arcbank && git pull origin main", timeout=60)

# Step 2: Check package.json
run(client, "ls /root/arcbank/")

# Step 3: npm ci
print("\n=== STEP 2: npm ci (may take 2-3 min) ===")
run(client, "cd /root/arcbank && npm ci 2>&1", timeout=300)

# Step 4: Create directories
run(client, "mkdir -p /root/arcbank/logs /root/arcbank/agents/state")

# Step 5: Create .env.local template
print("\n=== STEP 3: Create .env.local ===")
env_content = """NEXT_PUBLIC_ARC_RPC=https://rpc.testnet.arc.network
BOT_PRIVATE_KEY=REPLACE_WITH_BOT_WALLET_PRIVATE_KEY
POOL_START_BLOCK=0
DRY_RUN=true
"""
run(client, f"cat > /root/arcbank/.env.local << 'ENVEOF'\n{env_content}ENVEOF")
run(client, "cat /root/arcbank/.env.local")

# Step 6: Test ts-node
print("\n=== STEP 4: Test ts-node ===")
run(client, "cd /root/arcbank && npx ts-node --version 2>&1")

# Step 7: Verify agents exist
print("\n=== STEP 5: Verify agent files ===")
run(client, "ls /root/arcbank/agents/")
run(client, "ls /root/arcbank/agents/lib/")

print("\n=== SETUP COMPLETE ===")
print("Next: Add BOT_PRIVATE_KEY to /root/arcbank/.env.local, then start PM2")

client.close()

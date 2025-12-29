#!/bin/bash

echo "==================================="
echo "🔍 REDIS CONNECTION CHECK"
echo "==================================="
echo ""

# 1. Check if Redis server is running
echo "1️⃣  Checking if Redis server is running..."
if redis-cli ping > /dev/null 2>&1; then
    echo "   ✅ Redis server is RUNNING (Port 6379)"
else
    echo "   ❌ Redis server is NOT running"
    echo "   Start with: redis-server"
    exit 1
fi
echo ""

# 2. Check Redis info
echo "2️⃣  Redis Server Info:"
echo "   Version: $(redis-cli INFO server | grep redis_version | cut -d: -f2)"
echo "   Uptime: $(redis-cli INFO server | grep uptime_in_seconds | cut -d: -f2) seconds"
echo "   Used Memory: $(redis-cli INFO memory | grep used_memory_human | cut -d: -f2)"
echo ""

# 3. Check connected clients
echo "3️⃣  Connected Clients:"
CLIENT_COUNT=$(redis-cli INFO clients | grep connected_clients | cut -d: -f2 | tr -d '\r')
echo "   Total clients: $CLIENT_COUNT"
if [ "$CLIENT_COUNT" -gt 1 ]; then
    echo "   ✅ Bot appears to be connected!"
else
    echo "   ⚠️  Only CLI connected (bot may not be running)"
fi
echo ""

# 4. Check for order data in Redis
echo "4️⃣  Order Data in Redis:"
ORDER_KEYS=$(redis-cli KEYS "order:*" | wc -l | tr -d ' ')
echo "   Cached orders: $ORDER_KEYS"
if [ "$ORDER_KEYS" -gt 0 ]; then
    echo "   Recent keys:"
    redis-cli KEYS "order:*" | head -5 | sed 's/^/   - /'
fi
echo ""

# 5. Monitor Redis in real-time (optional)
echo "5️⃣  Live monitoring options:"
echo "   📊 Monitor all commands: redis-cli MONITOR"
echo "   📈 Watch stats: watch -n 1 'redis-cli INFO stats'"
echo "   🔍 View all keys: redis-cli KEYS \"*\""
echo ""

# 6. Test Redis read/write
echo "6️⃣  Testing Redis operations..."
redis-cli SET test:connection "$(date)" EX 10 > /dev/null
TEST_VAL=$(redis-cli GET test:connection)
if [ ! -z "$TEST_VAL" ]; then
    echo "   ✅ Write/Read test: SUCCESS"
    echo "   Value: $TEST_VAL"
else
    echo "   ❌ Write/Read test: FAILED"
fi
echo ""

echo "==================================="
echo "✅ Redis check complete!"
echo "==================================="

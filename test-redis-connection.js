/**
 * Quick script to test Redis connection from Node.js (bot's perspective)
 * Usage: node test-redis-connection.js
 */

const Redis = require('ioredis');

async function testRedisConnection() {
    console.log('====================================');
    console.log('🔌 Testing Redis Connection from Node.js');
    console.log('====================================\n');

    let client = null;

    try {
        // Same config as bot uses
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        console.log(`📍 Connecting to: ${redisUrl}`);

        client = new Redis(redisUrl, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            retryStrategy(times) {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
        });

        // Event listeners
        client.on('connect', () => {
            console.log('✅ [Event] Connected to Redis');
        });

        client.on('ready', () => {
            console.log('✅ [Event] Redis is ready');
        });

        client.on('error', (error) => {
            console.error('❌ [Event] Redis error:', error.message);
        });

        client.on('close', () => {
            console.log('🔴 [Event] Redis connection closed');
        });

        // Test ping
        console.log('\n1️⃣  Testing PING...');
        const pong = await client.ping();
        console.log(`   Response: ${pong} ✅`);

        // Test write
        console.log('\n2️⃣  Testing WRITE...');
        const testKey = 'test:node:connection';
        const testValue = { timestamp: new Date().toISOString(), test: true };
        await client.set(testKey, JSON.stringify(testValue), 'EX', 60);
        console.log(`   Wrote to key: ${testKey} ✅`);

        // Test read
        console.log('\n3️⃣  Testing READ...');
        const retrieved = await client.get(testKey);
        const parsed = JSON.parse(retrieved);
        console.log(`   Retrieved:`, parsed);
        console.log(`   ✅ Read successful`);

        // Test order data methods (like bot uses)
        console.log('\n4️⃣  Testing ORDER DATA methods...');
        const orderKey = 'test_order_123';
        const orderData = {
            customerDiscordId: '123456789',
            orderValue: 100,
            deposit: 10,
            timestamp: Date.now(),
        };

        await client.set(`order:${orderKey}`, JSON.stringify(orderData), 'EX', 1800);
        console.log(`   ✅ Stored order data`);

        const retrievedOrder = await client.get(`order:${orderKey}`);
        const parsedOrder = JSON.parse(retrievedOrder);
        console.log(`   ✅ Retrieved order:`, parsedOrder);

        await client.del(`order:${orderKey}`);
        console.log(`   ✅ Deleted test order data`);

        // Check how many keys exist
        console.log('\n5️⃣  Checking existing keys...');
        const allKeys = await client.keys('*');
        console.log(`   Total keys in Redis: ${allKeys.length}`);

        const orderKeys = await client.keys('order:*');
        console.log(`   Order keys: ${orderKeys.length}`);
        if (orderKeys.length > 0) {
            console.log(`   Order keys:`, orderKeys.slice(0, 5));
        }

        console.log('\n====================================');
        console.log('✅ All tests passed! Redis is working!');
        console.log('====================================\n');

    } catch (error) {
        console.error('\n❌ Redis connection failed:');
        console.error(`   Error: ${error.message}`);
        console.error(`   Stack:`, error.stack);
        process.exit(1);
    } finally {
        if (client) {
            await client.quit();
            console.log('👋 Disconnected from Redis\n');
        }
    }
}

testRedisConnection();

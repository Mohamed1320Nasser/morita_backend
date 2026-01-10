/**
 * Test script to verify the orders endpoint is working
 *
 * Usage:
 * 1. Make sure the backend server is running
 * 2. Get a valid admin JWT token
 * 3. Run: node test-orders-endpoint.js YOUR_JWT_TOKEN
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const token = process.argv[2];

if (!token) {
    console.error('❌ Error: Please provide a JWT token');
    console.log('Usage: node test-orders-endpoint.js YOUR_JWT_TOKEN');
    process.exit(1);
}

console.log('🔍 Testing Orders Endpoint...\n');

// Test 1: Get debug info
function testDebugEndpoint() {
    return new Promise((resolve, reject) => {
        console.log('📊 Test 1: Getting debug info...');

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/admin/orders/debug/count',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    const result = JSON.parse(data);
                    console.log('✅ Debug endpoint successful!');
                    console.log(`   Total orders in database: ${result.totalOrders}`);
                    console.log(`   Orders by status:`);
                    result.ordersByStatus.forEach(item => {
                        console.log(`     - ${item.status}: ${item.count}`);
                    });
                    console.log('');
                    resolve(result);
                } else {
                    console.log(`❌ Debug endpoint failed! Status: ${res.statusCode}`);
                    console.log(`   Response: ${data}`);
                    console.log('');
                    reject(new Error(`Status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (error) => {
            console.log(`❌ Connection error: ${error.message}`);
            reject(error);
        });

        req.end();
    });
}

// Test 2: Get orders with pagination
function testGetOrders() {
    return new Promise((resolve, reject) => {
        console.log('📋 Test 2: Getting orders (page 1, limit 10)...');

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/admin/orders/?page=1&limit=10',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    const result = JSON.parse(data);
                    console.log('✅ Orders endpoint successful!');
                    console.log(`   Page: ${result.page}`);
                    console.log(`   Limit: ${result.limit}`);
                    console.log(`   Total: ${result.total}`);
                    console.log(`   Total Pages: ${result.totalPages}`);
                    console.log(`   Orders returned: ${result.list.length}`);

                    if (result.list.length > 0) {
                        console.log(`\n   First order:`);
                        const first = result.list[0];
                        console.log(`     Order #: ${first.orderNumber}`);
                        console.log(`     Status: ${first.status}`);
                        console.log(`     Customer: ${first.customer?.fullname || 'N/A'}`);
                        console.log(`     Amount: $${first.orderValue}`);
                        console.log(`     Created: ${new Date(first.createdAt).toLocaleString()}`);
                    }
                    console.log('');
                    resolve(result);
                } else {
                    console.log(`❌ Orders endpoint failed! Status: ${res.statusCode}`);
                    console.log(`   Response: ${data}`);
                    console.log('');
                    reject(new Error(`Status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (error) => {
            console.log(`❌ Connection error: ${error.message}`);
            reject(error);
        });

        req.end();
    });
}

// Test 3: Get orders with different page
function testPagination() {
    return new Promise((resolve, reject) => {
        console.log('📄 Test 3: Testing pagination (page 2)...');

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: '/api/admin/orders/?page=2&limit=5',
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    const result = JSON.parse(data);
                    console.log('✅ Pagination test successful!');
                    console.log(`   Page 2 returned ${result.list.length} orders`);
                    console.log('');
                    resolve(result);
                } else {
                    console.log(`❌ Pagination test failed! Status: ${res.statusCode}`);
                    console.log('');
                    reject(new Error(`Status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (error) => {
            console.log(`❌ Connection error: ${error.message}`);
            reject(error);
        });

        req.end();
    });
}

// Run all tests
async function runTests() {
    try {
        await testDebugEndpoint();
        await testGetOrders();
        await testPagination();

        console.log('═'.repeat(50));
        console.log('🎉 All tests passed!');
        console.log('═'.repeat(50));
        console.log('\n✅ Backend orders endpoint is working correctly!\n');
        console.log('If your dashboard is not showing orders, the issue is likely in the frontend:');
        console.log('  1. Check if frontend is calling the correct URL: /api/admin/orders/');
        console.log('  2. Verify JWT token is being sent in Authorization header');
        console.log('  3. Check browser console for errors');
        console.log('  4. Verify frontend is sending page and limit parameters');
        console.log('  5. Check if frontend expects a different response format\n');

    } catch (error) {
        console.log('═'.repeat(50));
        console.log('❌ Some tests failed!');
        console.log('═'.repeat(50));
        console.log('\nPossible issues:');
        console.log('  1. Backend server not running on port 3000');
        console.log('  2. Invalid JWT token (expired or incorrect)');
        console.log('  3. Database connection issues');
        console.log('  4. No orders in database');
        console.log('\nCheck the server logs for more details.\n');
        process.exit(1);
    }
}

runTests();

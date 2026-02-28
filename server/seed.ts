import { randomUUID } from 'crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { 
  users, portfolios, cryptoPrices, transactions,
} from '@shared/schema';

// Database connection
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL or SUPABASE_DB_URL environment variable is required');
}

const client = postgres(connectionString);
const db = drizzle(client);

async function seed() {
  console.log('🌱 Starting database seeding...');

  try {
    // Clear existing data
    console.log('Clearing existing data...');
    await db.delete(portfolios);
    await db.delete(transactions);
    await db.delete(cryptoPrices);
    await db.delete(users);

    // Create demo user
    console.log('Creating demo user...');
    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      username: 'demo_user',
      email: 'demo@example.com',
      password: 'demo_password_hash',
      fullName: 'Demo User',
      creditScore: '0.90',
      isVerified: true,
      role: 'user'
    });
    console.log(`Created user with ID: ${userId}`);

    // Insert crypto prices
    console.log('Inserting crypto prices...');
    const cryptoData = [
      { symbol: 'BTC', price: '106014.59', change24h: '0.10', volume24h: '216800' },
      { symbol: 'ETH', price: '2424.00', change24h: '0.52', volume24h: '73200' },
      { symbol: 'TRX', price: '0.280042', change24h: '0.02', volume24h: '421500' },
      { symbol: 'USDT', price: '1.00', change24h: '0.00', volume24h: '1000000' },
      { symbol: 'XAU', price: '3338.645609', change24h: '0.00', volume24h: '52100' },
      { symbol: 'XAG', price: '36.111083', change24h: '0.00', volume24h: '129300' },
      { symbol: 'DOGE', price: '0.156977', change24h: '-6.17', volume24h: '543200' },
      { symbol: 'LTC', price: '83.75', change24h: '-5.71', volume24h: '76800' },
      { symbol: 'XRP', price: '2.17501', change24h: '-5.41', volume24h: '298100' },
      { symbol: 'BNB', price: '649.81', change24h: '6.52', volume24h: '187400' },
      { symbol: 'DOT', price: '3.3035', change24h: '-0.59', volume24h: '245100' },
    ];

    await db.insert(cryptoPrices).values(cryptoData);
    console.log('Crypto prices inserted successfully');

    // Insert portfolio data with real holdings
    console.log('Inserting portfolio data...');
    const portfolioData = [
      { userId, symbol: 'BTC', available: '0.5', frozen: '0.1' },
      { userId, symbol: 'ETH', available: '2.0', frozen: '0.5' },
      { userId, symbol: 'USDT', available: '10000.00', frozen: '500.00' },
      { userId, symbol: 'TRX', available: '5000.00', frozen: '1000.00' },
      { userId, symbol: 'DOGE', available: '10000.00', frozen: '2000.00' },
      { userId, symbol: 'XRP', available: '2000.00', frozen: '500.00' },
      { userId, symbol: 'BNB', available: '5.0', frozen: '1.0' },
      { userId, symbol: 'LTC', available: '10.0', frozen: '2.0' },
    ];

    await db.insert(portfolios).values(portfolioData);
    console.log('Portfolio data inserted successfully');

    // Insert some sample transactions
    console.log('Inserting sample transactions...');
    const transactionData = [
      { userId, type: 'deposit', symbol: 'BTC', amount: '0.5', status: 'completed', txHash: '0x123...', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
      { userId, type: 'deposit', symbol: 'ETH', amount: '2.0', status: 'completed', txHash: '0x456...', address: '0x742d35Cc6634C0532925a3b8D1428c9cA8DC70dd' },
      { userId, type: 'deposit', symbol: 'USDT', amount: '10000.00', status: 'completed', txHash: '0x789...', address: 'TQRFp4QcmiwM7bVsH8W2Eqj8PZnQ2H7e8R' },
      { userId, type: 'trade', symbol: 'BTC', amount: '0.1', status: 'completed' },
      { userId, type: 'trade', symbol: 'ETH', amount: '0.5', status: 'completed' },
    ];

    await db.insert(transactions).values(transactionData);
    console.log('Sample transactions inserted successfully');

    console.log('✅ Database seeding completed successfully!');
    console.log(`Demo user ID: ${userId}`);
    console.log('You can now test the portfolio with real data.');

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Run the seed function
seed().catch(console.error); 
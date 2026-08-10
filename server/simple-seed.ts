import "dotenv/config";
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.log('Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function simpleSeed() {
  console.log('🌱 Starting database setup (no dummy data)...');

  try {
    // Clear existing data
    console.log('Clearing existing data...');
    await supabase.from('portfolios').delete().neq('id', 0);
    await supabase.from('transactions').delete().neq('id', 0);
    await supabase.from('crypto_prices').delete().neq('id', 0);
    await supabase.from('users').delete().neq('id', 0);

    // Get or create demo user
    console.log('Getting demo user...');
    let { data: user, error: userError } = await supabase
      .from('users')
      .select()
      .eq('email', 'demo@becxus.com')
      .single();

    if (userError && userError.code === 'PGRST116') {
      // User doesn't exist, create it
      console.log('Creating demo user...');
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          email: 'demo@becxus.com',
          phone: '+1234567890',
          full_name: 'Demo User',
          address: '123 Demo Street, Demo City',
          role: 'user'
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating user:', createError);
        return;
      }
      user = newUser;
    } else if (userError) {
      console.error('❌ Error getting user:', userError);
      return;
    }

    const userId = user.id; // This is a UUID string
    console.log(`✅ Using user with ID: ${userId}`);

    // Insert sample trades for demonstration
    console.log('Inserting sample trades...');
    const sampleTrades = [
      { user_id: 1, symbol: 'BTC/USDT', side: 'buy', amount: '0.001', status: 'filled', created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
      { user_id: 1, symbol: 'ETH/USDT', side: 'sell', amount: '0.1', price: '2400.00', status: 'pending_approval', created_at: new Date().toISOString() },
      { user_id: 1, symbol: 'BTC/USDT', side: 'buy', amount: '0.005', price: '118000.00', status: 'pending_approval', created_at: new Date().toISOString() },
      { user_id: 1, symbol: 'DOGE/USDT', side: 'sell', amount: '1000', status: 'filled', created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
      { user_id: 1, symbol: 'BNB/USDT', side: 'buy', amount: '0.5', price: '650.00', status: 'cancelled', created_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString() }
    ];

    const { error: tradesError } = await supabase
      .from('trades')
      .insert(sampleTrades);

    if (tradesError) {
      console.error('❌ Error inserting sample trades:', tradesError);
    } else {
      console.log('✅ Sample trades inserted successfully');
    }

    // Insert sample portfolio data for demo user
    console.log('Inserting sample portfolio data...');
    const samplePortfolio = [
      {
        user_id: 1,
        symbol: 'USDT',
        available: '10000.00',
        frozen: '0.00'
      },
      {
        user_id: 1,
        symbol: 'BTC',
        available: '0.5',
        frozen: '0.0'
      },
      {
        user_id: 1,
        symbol: 'ETH',
        available: '5.0',
        frozen: '0.0'
      }
    ];

    const { error: portfolioError } = await supabase
      .from('portfolios')
      .insert(samplePortfolio);

    if (portfolioError) {
      console.error('❌ Error inserting sample portfolio:', portfolioError);
    } else {
      console.log('✅ Sample portfolio data inserted successfully');
    }

    console.log('✅ Database setup completed!');
    console.log('📝 Sample data inserted for demonstration.');
    console.log('🔄 Crypto prices will be fetched live from external APIs.');
    console.log('💼 Portfolio will be empty until real transactions are made.');
    console.log('📊 Sample trades added for order management testing.');
    console.log(`👤 Demo user ID: ${userId}`);

  } catch (error) {
    console.error('❌ Error during setup:', error);
  }
}

simpleSeed(); 
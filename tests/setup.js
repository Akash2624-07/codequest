// Runs once per test file, before any test in it.

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Fakes rather than dotenv: loading the real .env would also define
// DB_CONNECT_URI and put the real database one stray connect() away.
process.env.JWT_SECRET_KEY = 'test-jwt-secret-not-a-real-key';
process.env.CLIENT_URL = 'http://localhost:5173';

if (process.env.DB_CONNECT_URI) {
  throw new Error('DB_CONNECT_URI is set — refusing to run tests against a real database.');
}

// Module scope, not a hook: the mailer double seeds require.cache and must be
// in place before any test file requires src/app.
const { installFakes, resetFakes } = require('./helpers/fakes');
installFakes();

let mongod;


beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri)
});

afterEach(async () => {
  // Clear collections rather than dropping the database, so indexes survive.
  // Promise.all so one rejection can't leave the rest dirty for the next test.
  const collections = mongoose.connection.collections
  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({}))
  )

  resetFakes()
})

afterAll(async () => {
  try {
    await mongoose.disconnect()
  } finally {
    // finally, so a failed disconnect can't leak the mongod process.
    // Optional-chained: a failed beforeAll leaves mongod undefined.
    await mongod?.stop()
  }
})

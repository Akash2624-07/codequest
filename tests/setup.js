// Runs once per test file, before any test in it.

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// Fake env, assigned here rather than loaded from .env on purpose. Loading the
// real file would also load DB_CONNECT_URI, and then a stray mongoose.connect()
// anywhere in the code under test would reach the real Atlas cluster.
process.env.JWT_SECRET_KEY = 'test-jwt-secret-not-a-real-key';
process.env.CLIENT_URL = 'http://localhost:5173';

// Belt and braces: if anything ever does load the real env, fails here
// rather than quietly writing test data into a production database.
if (process.env.DB_CONNECT_URI) {
  throw new Error('DB_CONNECT_URI is set — refusing to run tests against a real database.');
}

// Install the external-service doubles at module scope, not in a hook. The
// mailer double works by seeding require.cache, so it has to be in place before
// any test file requires src/app and pulls the real module in transitively.
const { installFakes, resetFakes } = require('./helpers/fakes');
installFakes();

let mongod;


beforeAll(async () => {
    mongod = await MongoMemoryServer.create(); // spin up in-memory MongoDB
    const uri = mongod.getUri();  // get its URI
    await mongoose.connect(uri)    // connect mongoose to THAT uri
});

afterEach(async () => {
  // clear every collection — NOT drop the database
  // Promise.all, not a sequential loop: every collection is attempted even if one
  // rejects, so a single failure can't leave later collections dirty for the next
  // test. Still rejects afterwards — allSettled would hide the failure entirely.
  const collections = mongoose.connection.collections
  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({}))   // wipe data, keep structure
  )

  // The doubles hold state too — a captured email or a leftover verify: key
  // would leak into the next test exactly like an uncleared collection would.
  resetFakes()
})

afterAll(async () => {
  // try/finally sequences the cleanup, it does not swallow anything: if
  // disconnect() rejects, stop() still runs and the original error still
  // propagates. Without it a failed disconnect leaks an orphaned mongod process.
  try {
    await mongoose.disconnect()   // 1. disconnect mongoose FIRST
  } finally {
    await mongod?.stop()          // 2. then stop the server. Optional-chained so that a
                                  //    failed beforeAll reports its own error instead of
                                  //    a misleading teardown crash.
  }
})

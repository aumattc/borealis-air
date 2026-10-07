/**
 * Test environment. Imported first by every test file so these values are in
 * place before the config module is evaluated.
 */
process.env.NODE_ENV = 'test'
process.env.DATABASE_PATH = ':memory:'
process.env.PAYMENT_PROVIDER = 'mock'
process.env.SESSION_SECRET = 'test-secret-not-used-anywhere-real'
process.env.LOG_LEVEL = 'error'
process.env.TRUST_PROXY = 'false'

// High ceilings so ordinary test flows never trip the throttles.
process.env.RL_REGISTER_PER_HOUR = '10000'
process.env.RL_LOGIN_IP_PER_15MIN = '10000'
process.env.RL_LOGIN_EMAIL_PER_15MIN = '10000'
process.env.RL_CHECKOUT_PER_MINUTE = '10000'

export const TEST_ADMIN = {
  email: 'admin@test.borealis',
  password: 'test-admin-password',
}

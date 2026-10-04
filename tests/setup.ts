// Global test setup
process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-api-key';
process.env.DB_PATH = ':memory:'; 
jest.setTimeout(10000);
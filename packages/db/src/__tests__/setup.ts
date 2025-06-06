/// <reference types="jest" />

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';

// Mock postgres connection
jest.mock('postgres', () => {
  const mockSql = jest.fn();
  mockSql.mockReturnValue(mockSql);
  return jest.fn(() => mockSql);
});

// Increase timeout for database tests
jest.setTimeout(10000); 
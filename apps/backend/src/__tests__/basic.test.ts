/// <reference types="jest" />

describe('Basic Setup Tests', () => {
  test('should pass basic assertion', () => {
    expect(1 + 1).toBe(2);
  });

  test('should handle async operations', async () => {
    const promise = Promise.resolve('test');
    await expect(promise).resolves.toBe('test');
  });

  test('should have access to environment variables', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });
}); 
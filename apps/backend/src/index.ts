import Fastify from 'fastify';

const fastify = Fastify({
  logger: true
});

// Health check route
fastify.get('/healthz', async () => {
  return { ok: true, timestamp: new Date().toISOString() };
});

// Start server
const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 3001;
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 Backend server running on port ${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start(); 
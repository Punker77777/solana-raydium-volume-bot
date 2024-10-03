module.exports = {
  apps: [
    {
      name: 'web3wiza-volume-bot',
      script: 'index.ts',
      interpreter: 'ts-node',
      watch: true,
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
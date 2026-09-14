module.exports = {
  apps: [
    {
      name: 'registration-api',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    }
  ]
};
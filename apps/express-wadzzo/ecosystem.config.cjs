module.exports = {
  apps: [
    {
      name: "express-server",
      script: "dist/index.js",
      // The folder this file sits in (apps/express-wadzzo inside the monorepo checkout).
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_restarts: 50,
      restart_delay: 3000,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

module.exports = {
  apps: [{
    name: 'crm-backend',
    script: 'dist/main.js',
    cwd: '/var/www/crm-backend',
    env: {
      TZ: 'Asia/Shanghai',
      PORT: 3000,
    }
  }]
};

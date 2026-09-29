module.exports = {
  apps: [
    {
      name: 'flipkart-review-search',
      script: './server/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        MONGODB_URI: 'mongodb+srv://offertricksandpromocode_db_user:KMhZIVuxHEmSiSku@cluster0.4mrmksu.mongodb.net/?retryWrites=true&w=majority'
      }
    }
  ]
};

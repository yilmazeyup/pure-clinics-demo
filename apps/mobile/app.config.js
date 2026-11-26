// app.json holds the configuration. This file only adds the web base path when the app is exported
// for a sub-folder, such as /app/ on pureclinics.savastana.com (EXPO_BASE_URL=/app).
module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    ...(process.env.EXPO_BASE_URL ? { baseUrl: process.env.EXPO_BASE_URL } : {}),
  },
});

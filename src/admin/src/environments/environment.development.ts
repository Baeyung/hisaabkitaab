export const environment = {
  production: false,
  // The backend runs on 8080; this app on 4201. Both are in the API's CORS allowlist
  // (app.cors.allowed-origins).
  apiUrl: 'http://localhost:8080/api',
};

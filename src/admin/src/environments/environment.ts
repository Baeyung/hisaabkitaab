export const environment = {
  production: true,
  // Same backend as the user app — the admin API is just a package behind ROLE_ADMIN.
  // Relative in production (admin app served alongside the API); absolute in development,
  // see environment.development.ts.
  apiUrl: '/api',
};

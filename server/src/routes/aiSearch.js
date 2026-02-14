export const registerAiSearchRoute = (app, handler) => {
  app.post('/api/ai/search', handler);
};

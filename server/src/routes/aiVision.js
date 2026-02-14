export const registerAiVisionRoute = (app, handler) => {
  app.post('/api/ai/vision', handler);
};

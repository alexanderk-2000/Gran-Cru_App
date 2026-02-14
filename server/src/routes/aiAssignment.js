export const registerAiAssignmentRoute = (app, handler) => {
  app.post('/api/ai/assignment', handler);
};

export const registerHealthRoute = (app, getStatus) => {
  app.get('/api/health', (req, res) => {
    res.json(getStatus());
  });
};

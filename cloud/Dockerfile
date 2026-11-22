FROM mcr.microsoft.com/playwright:v1.65.1-noble
WORKDIR /app
COPY cloud/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY cloud/src/ ./src/
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
USER pwuser
EXPOSE 3000
CMD ["node","src/server.js"]

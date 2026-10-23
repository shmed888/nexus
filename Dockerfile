FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=development
ENV DATABASE_URL=postgresql://nexus:nexus_local_only@localhost:5432/nexus?schema=public
COPY package.json ./
COPY server/prisma ./server/prisma
RUN npm install --no-audit --no-fund
RUN npm run db:generate
COPY . .
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm start"]

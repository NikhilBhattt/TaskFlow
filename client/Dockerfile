# ---- build stage: compile the React app ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# VITE_API_URL is left empty on purpose: the browser calls /api on the same origin
# and nginx forwards it to the API container.
RUN npm run build

# ---- runtime stage: static files behind nginx ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

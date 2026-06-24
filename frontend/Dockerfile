FROM node:20-alpine AS build
WORKDIR /app
ARG VITE_API_BASE
ENV VITE_API_BASE=$VITE_API_BASE

ARG VITE_APP_VERSION=0.0.1-snapshot
ENV VITE_APP_VERSION=${VITE_APP_VERSION}

# index.html references %VITE_SITE_ORIGIN%; it must be defined at build time or
# vite's build-html stage fails with "URI malformed". Default to the local origin.
ARG VITE_SITE_ORIGIN=http://localhost:8081
ENV VITE_SITE_ORIGIN=${VITE_SITE_ORIGIN}

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

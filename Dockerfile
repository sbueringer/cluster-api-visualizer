# syntax=docker/dockerfile:1

# Build architecture
ARG ARCH

# Build the web app.
FROM node:16 as web-builder

WORKDIR /app
COPY ./web /app
RUN npm install --legacy-peer-deps
RUN npm run build


# Build the Go binary.
# Alpine is chosen for its small footprint
# compared to Ubuntu
FROM golang:1.17-alpine as builder

# Set working directory
WORKDIR /app

# Download necessary Go modules
COPY go.mod ./
COPY go.sum ./

RUN --mount=type=cache,target=/go/pkg/mod \
go mod download


COPY ./main.go /app/
COPY ./internal /app/internal

ARG ARCH

RUN CGO_ENABLED=0 GOOS=linux GOARCH=${ARCH} go build -trimpath -ldflags "-extldflags '-static'" -o main

# Build production image
FROM gcr.io/distroless/static:nonroot-${ARCH}

# Set working directory
WORKDIR /app

COPY --from=builder /app/main /app/main

COPY --from=web-builder /app/dist /app/web/dist

EXPOSE 8081

ENTRYPOINT [ "/app/main", "-host", "0.0.0.0", "-generate-config" ]

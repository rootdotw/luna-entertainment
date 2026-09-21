FROM mcr.microsoft.com/powershell:lts-ubuntu-22.04

WORKDIR /app

# Install standard CA certificates
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Copy website files and backend
COPY . .

# Koyeb and standard cloud hosts default to port 8080
ENV PORT=8080
EXPOSE 8080

# Launch server
CMD ["pwsh", "-NoProfile", "-File", "./serve.ps1", "-Port", "8080"]

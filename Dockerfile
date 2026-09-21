FROM mcr.microsoft.com/powershell:lts-ubuntu-22.04

WORKDIR /app

# Install standard CA certificates
RUN apt-get update && apt-get install -y ca-certificates curl && rm -rf /var/lib/apt/lists/*

# Copy website files and backend
COPY . .

# Render standard port
ENV PORT=10000
EXPOSE 10000

# Launch server
CMD ["pwsh", "-NoProfile", "-File", "./serve.ps1", "-Port", "10000"]

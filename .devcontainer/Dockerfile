# Dockerfile
FROM node:16

# Install git, process tools
RUN apt-get update && apt-get -y install git procps

# Clean up
RUN apt-get autoremove -y && apt-get clean -y && rm -rf /var/lib/apt/lists/*

# Install TypeScript and Jest globally
RUN npm install -g typescript jest ts-jest && npm cache clean --force

WORKDIR /workspace

# Switch back to dialog for any ad-hoc use of apt-get
ENV DEBIAN_FRONTEND=dialog

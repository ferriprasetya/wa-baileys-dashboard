---
applyTo: '**'
---

Provide project context and coding guidelines that AI should follow when generating code, answering questions, or reviewing changes.

# Project Context

This project is a WhatsApp Gateway Dashboard built with Fastify, Baileys, PostgreSQL, and Redis. It features an authentication module for Super Admin access, a dashboard for tenant management, and a WhatsApp engine module that handles connections and messaging via Baileys. The application is containerized using Docker and orchestrated with Docker Compose.

# Coding Guidelines

- Follow the existing project structure and coding conventions.
- Use TypeScript for all server-side code.
- Ensure database interactions are handled using Drizzle ORM.
- Use Tailwind CSS for styling EJS templates.
- Write clear and maintainable code with appropriate comments.
- Adhere to best practices for error handling and input validation.
- Ensure compatibility with Docker and Docker Compose for local development and deployment.

# Development Practices

- Write modular code that aligns with the defined modules in the implementation plan.
- Use Git for version control and follow a consistent branching strategy.
- Include unit tests for critical components and functionalities.
- Don't create any documentation files, but ensure code is self-documented through comments (don't over-comment) and clear naming conventions.

# Communication

- When discussing code changes or issues, refer to specific modules or scopes as defined in the implementation plan.
- Provide clear explanations and justifications for code decisions or changes.

# Review Process

- Conduct thorough code reviews focusing on functionality, security, and performance.
- Ensure all new code is tested and documented before merging into the main branch.

# Docker and Environment

- Use service names as hostnames for inter-service communication in Docker Compose.
- Ensure environment variables are properly configured for different environments (development, production).
- Maintain volume mappings in Docker Compose to support hot reloading during development.

# End of instructions

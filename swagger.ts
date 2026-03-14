import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Route Optimization Service API',
      version: '1.0.0',
      description: 'API for optimizing delivery routes using OR-Tools and OpenRouteService',
    },
    servers: [
      { url: 'http://localhost:3000/api/v1', description: 'Local' },
      { url: 'https://your-render-app.onrender.com/api/v1', description: 'Production' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'], // paths to your route files
};

const specs = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));
  console.log('Swagger UI available at /api-docs');
}
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
    swaggerDefinition: {
        info: {
            title: 'Nazwa Twojej aplikacji',
            version: '1.0.0',
            description: 'Opis Twojej aplikacji',
        },
    },
    apis: ['server.js'],
};

const specs = swaggerJsdoc(options);

module.exports = { swaggerUi, specs };

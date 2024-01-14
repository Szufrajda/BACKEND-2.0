const express = require('express');
const { MongoClient } = require('mongodb');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json');

const app = express();
const port = 3001;

app.use('/swag', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const mongoUrl = 'mongodb://localhost:27017';
const dbName = 'productsDB';
const collectionName = 'products';

app.use(express.json());

const client = new MongoClient(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });

let db;

client.connect()
    .then(async () => {
        console.log('Połączenie z bazą danych udane');

        db = client.db(dbName);

        const collection = db.collection(collectionName);

        const result = await collection.deleteMany({});

        console.log(`${result.deletedCount} produkty zostały usunięte z kolekcji.`);

        const count = await collection.countDocuments();
        if (count === 0) {
            const data = fs.readFileSync('products.json', 'utf8');
            const productsData = JSON.parse(data);

            // Dodaj pole 'id' do danych produktów
            productsData.forEach((product, index) => {
                product.id = index + 1;
            });

            const insertResult = await collection.insertMany(productsData);

            console.log(`${insertResult.insertedCount} produkty zostały dodane do kolekcji.`);
        } else {
            console.log('Kolekcja już zawiera produkty, pomijam dodawanie.');
        }

        // Definicja REST API endpointów

        app.get('/products', async (req, res) => {
            try {
                const { name, minPrice, maxPrice, minQuantity, maxQuantity, sortBy, sortOrder } = req.query;

                // Filtrowanie
                const filter = {};
                if (name) {
                    filter.name = { $regex: new RegExp(name, 'i') };
                }
                if (minPrice) {
                    filter.price = { $gte: parseFloat(minPrice) };
                }
                if (maxPrice) {
                    filter.price = { ...filter.price, $lte: parseFloat(maxPrice) };
                }
                if (minQuantity) {
                    filter.quantity = { $gte: parseInt(minQuantity) };
                }
                if (maxQuantity) {
                    filter.quantity = { ...filter.quantity, $lte: parseInt(maxQuantity) };
                }

                // Sortowanie
                const sort = {};
                if (sortBy) {
                    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
                }

                // Pobranie produktów z bazy danych
                const products = await collection.find(filter).sort(sort).toArray();

                const formattedProducts = products.map(({ _id, ...rest }) => rest);

                res.json(formattedProducts);
            } catch (error) {
                console.error('Błąd podczas pobierania produktów:', error);
                res.status(500).json({ message: 'Wystąpił błąd podczas pobierania produktów' });
            }
        });

        app.post('/products', async (req, res) => {
            try {
                const { id, name, price, description, quantity, unit } = req.body;

                // Sprawdź, czy produkt o podanym ID lub nazwie już istnieje
                const existingProductById = await db.collection(collectionName).findOne({ id: parseInt(id) });
                const existingProductByName = await db.collection(collectionName).findOne({ name });

                if (existingProductById || existingProductByName) {
                    return res.status(400).json({ error: 'Produkt o podanym ID lub nazwie już istnieje.' });
                }

                const result = await collection.insertOne({
                    id: parseInt(id),
                    name,
                    price: parseFloat(price),
                    description,
                    quantity: parseInt(quantity),
                    unit,
                });

                console.log(`Dodano nowy produkt: ${name}`);
                res.status(201).json({ message: 'Produkt dodany pomyślnie.' });
            } catch (error) {
                console.error('Błąd podczas dodawania produktu:', error);
                res.status(500).send('Błąd serwera');
            }
        });

        app.put('/products/:id', async (req, res) => {
            try {
                const productId = req.params.id;
                const { name, price, description, quantity, unit } = req.body;

                // Sprawdź, czy produkt istnieje o podanym ID
                const existingProduct = await db.collection(collectionName).findOne({ id: parseInt(productId) });

                if (!existingProduct) {
                    return res.status(404).json({ error: 'Produkt o podanym ID nie istnieje.' });
                }

                // Aktualizuj dane produktu
                const updateResult = await db.collection(collectionName).updateOne(
                    { id: parseInt(productId) },
                    {
                        $set: {
                            name: name || existingProduct.name,
                            price: price || existingProduct.price,
                            description: description || existingProduct.description,
                            quantity: quantity || existingProduct.quantity,
                            unit: unit || existingProduct.unit,
                        },
                    }
                );

                if (updateResult.modifiedCount > 0) {
                    console.log(`Produkt o ID ${productId} został zaktualizowany.`);
                    res.json({ message: 'Produkt zaktualizowany pomyślnie.' });
                } else {
                    console.log(`Nie dokonano żadnych zmian w produkcie o ID ${productId}.`);
                    res.json({ message: 'Brak zmian w produkcie.' });
                }
            } catch (error) {
                console.error('Błąd podczas edycji produktu:', error);
                res.status(500).send('Błąd serwera');
            }
        });

        app.delete('/products/:id', async (req, res) => {
            try {
                const productId = req.params.id;

                // Sprawdź, czy produkt istnieje o podanym ID
                const existingProduct = await db.collection(collectionName).findOne({ id: parseInt(productId) });

                if (!existingProduct) {
                    return res.status(404).json({ error: 'Produkt o podanym ID nie istnieje.' });
                }

                // Sprawdź, czy ilość produktu na magazynie jest większa od 0
                if (existingProduct.quantity === 0) {
                    return res.status(400).json({ error: 'Produkt nie może być usunięty, ponieważ ilość na magazynie wynosi 0.' });
                }

                // Usuń produkt z bazy danych
                const deleteResult = await db.collection(collectionName).deleteOne({ id: parseInt(productId) });

                if (deleteResult.deletedCount > 0) {
                    console.log(`Produkt o ID ${productId} został usunięty.`);
                    res.json({ message: 'Produkt usunięty pomyślnie.' });
                } else {
                    console.log(`Nie dokonano żadnych zmian w produkcie o ID ${productId}.`);
                    res.json({ message: 'Brak zmian w produkcie.' });
                }
            } catch (error) {
                console.error('Błąd podczas usuwania produktu:', error);
                res.status(500).send('Błąd serwera');
            }
        });

        app.get('/inventory-report', async (req, res) => {
            try {
                const pipeline = [
                    {
                        $group: {
                            _id: null,
                            totalQuantity: { $sum: "$quantity" },
                            totalValue: { $sum: { $multiply: ["$quantity", "$price"] } }
                        }
                    }
                ];

                const reportResult = await db.collection(collectionName).aggregate(pipeline).toArray();

                if (reportResult.length > 0) {
                    res.json({
                        totalQuantity: reportResult[0].totalQuantity,
                        totalValue: reportResult[0].totalValue
                    });
                } else {
                    res.json({
                        totalQuantity: 0,
                        totalValue: 0
                    });
                }
            } catch (error) {
                console.error('Błąd podczas generowania raportu:', error);
                res.status(500).json({ message: 'Wystąpił błąd podczas generowania raportu' });
            }
        });

        app.listen(port, () => {
            console.log(`Serwer nasłuchuje na porcie ${port}`);
        });
    })
    .catch(err => console.error('Błąd połączenia z bazą danych:', err));

const path = require('path');
const dotenv = require('dotenv-safe');
const express = require('express');
const bodyParser = require('body-parser');
const _ = require('lodash');
const { MongoClient } = require('mongodb');
const Bulker = require('./bulk');

dotenv.config({
    path: path.join(__dirname, '.env'),
    sample: path.join(__dirname, '.env.example'),
});

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;
const PORT = parseInt(process.env.PORT, 10) || 3000;

const INCREASE_BULK_TIMEOUT =
    parseInt(process.env.INCREASE_BULK_TIMEOUT, 10) || 1000;
const INCREASE_BULK_SIZE = parseInt(process.env.INCREASE_BULK_SIZE, 10) || 5000;

const mongoClient = new MongoClient(MONGO_URI, {
    useUnifiedTopology: true,
    maxPoolSize: 100, // Set equal to concurrent request to avoid waiting for connection
    maxIdleTimeMS: 10000,
    // loggerLevel: 'debug',
});

const db = mongoClient.db(MONGO_DB_NAME);

const app = express();

app.use(bodyParser.json());
app.disable('etag');
app.disable('x-powered-by');

// Init bulk operations

const counterBulker = new Bulker(
    INCREASE_BULK_SIZE,
    INCREASE_BULK_TIMEOUT,
    async (items) => {
        await db.collection('counters').bulkWrite(
            items.map((item) => ({
                updateOne: {
                    filter: { _id: Number(item.id) },
                    update: { $inc: { value: 1 } },
                    upsert: true,
                },
            })),
            { ordered: false }
        );
    }
);

const counterReduceBulker = new Bulker(
    INCREASE_BULK_SIZE,
    INCREASE_BULK_TIMEOUT,
    async (items) => {
        await db.collection('counters').bulkWrite(
            _.toPairs(_.countBy(items, 'id')).map(([id, count]) => ({
                updateOne: {
                    filter: { _id: Number(id) },
                    update: { $inc: { value: count } },
                    upsert: true,
                },
            }))
        );
    }
);

// Increase a counter

app.post('/increase_sync', async (req, res) => {
    const body = req.body;
    await db
        .collection('counters')
        .updateOne({ _id: body.id }, { $inc: { value: 1 } }, { upsert: true });
    res.send('Ok');
});

app.post('/increase_async', async (req, res) => {
    const body = req.body;
    db.collection('counters').updateOne(
        { _id: body.id },
        { $inc: { value: 1 } },
        { upsert: true }
    );
    res.send('Ok');
});

app.post('/increase_bulk', async (req, res) => {
    const body = req.body;
    counterBulker.push(body);
    res.send('Ok');
});

app.post('/increase_reduce_bulk', async (req, res) => {
    const body = req.body;
    counterReduceBulker.push(body);
    res.send('Ok');
});

// Empty GET request to test overhead of framework

app.get('/', async (req, res) => {
    res.send('Ok');
});

// Empty POST request to test base network latency

app.post('/', async (req, res) => {
    res.send('Ok');
});

mongoClient.connect((err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    app.listen(PORT, () => {
        console.log(`Application is listening at http://localhost:${PORT}`);
    });
});

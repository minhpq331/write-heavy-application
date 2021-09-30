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

const INSERT_BULK_TIMEOUT =
    parseInt(process.env.INSERT_BULK_TIMEOUT, 10) || 1000;
const INSERT_BULK_SIZE = parseInt(process.env.INSERT_BULK_SIZE, 10) || 1000;
const INSERT_GROUP_TIMEOUT =
    parseInt(process.env.INSERT_GROUP_TIMEOUT, 10) || 60000;
const INSERT_GROUP_SIZE = parseInt(process.env.INSERT_GROUP_SIZE, 10) || 100000;
const INSERT_GROUP_CHUNK_SIZE =
    parseInt(process.env.INSERT_GROUP_CHUNK_SIZE, 10) || 100;

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

const insertBulker = new Bulker(
    INSERT_BULK_SIZE,
    INSERT_BULK_TIMEOUT,
    async (items) => {
        await db.collection('logs').insertMany(items);
    }
);

const groupBulker = new Bulker(
    INSERT_GROUP_SIZE,
    INSERT_GROUP_TIMEOUT,
    async (items) => {
        let chunk = [];
        const start = new Date();
        for (let i = 0; i < items.length; i++) {
            await (async function (item) {
                chunk.push(db.collection('logs').insertOne(item));
                if (i % INSERT_GROUP_CHUNK_SIZE === 0) {
                    await Promise.all(chunk);
                    chunk = [];
                }
            })(items[i]);
        }
        console.log(`Group taked ${new Date() - start} ms`);
    }
);

// Insert a log

app.post('/insert_sync', async (req, res) => {
    const body = req.body;
    await db.collection('logs').insertOne(body);
    res.send('Ok');
});

app.post('/insert_async', async (req, res) => {
    const body = req.body;
    db.collection('logs').insertOne(body);
    res.send('Ok');
});

app.post('/insert_group', async (req, res) => {
    const body = req.body;
    groupBulker.push(body);
    res.send('Ok');
});

app.post('/insert_bulk', async (req, res) => {
    const body = req.body;
    insertBulker.push(body);
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
    const server = app.listen(PORT, () => {
        console.log(`Application is listening at http://localhost:${PORT}`);
    });

    const terminate = function () {
        server.close(async () => {
            console.log('HTTP server closed, flushing batch...');
            await groupBulker.flush();
            await mongoClient.close();
            console.log('Cleaned everything, bye bye.');
        });
    }

    process.on('SIGTERM', () => {
        console.log('SIGTERM signal received: closing HTTP server');
        terminate();
    });
    process.on('SIGINT', () => {
        console.log('SIGINT signal received: closing HTTP server');
        terminate();
    });
});

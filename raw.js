const path = require('path');
const dotenv = require('dotenv-safe');
const { MongoClient } = require('mongodb');
const _ = require('lodash');
const Bulker = require('./bulk');

dotenv.config({
    path: path.join(__dirname, '.env'),
    sample: path.join(__dirname, '.env.example'),
});

const ENDPOINT = process.argv[2];
const NUMBER_OF_LOOP = parseInt(process.argv[3], 10);

const MONGO_URI = process.env.MONGO_URI;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME;

const INSERT_BULK_TIMEOUT =
    parseInt(process.env.INSERT_BULK_TIMEOUT, 10) || 1000;
const INSERT_BULK_SIZE = parseInt(process.env.INSERT_BULK_SIZE, 10) || 1000;
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

let counter = 0;

const insertBulker = new Bulker(
    INSERT_BULK_SIZE,
    INSERT_BULK_TIMEOUT,
    async (items) => {
        await db.collection('logs').insertMany(items);
    },
    counter
);

const counterBulker = new Bulker(
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

async function run() {
    const start = new Date();
    async function insert() {
        const body = {
            title: 'My awesome test',
            description: 'This is a test',
        };
        await db
            .collection('logs')
            .insertOne(body)
            .then(() => {
                counter += 1;
                if (counter === NUMBER_OF_LOOP) {
                    const taked = new Date() - start;
                    console.log(
                        `Taked ${taked} ms, avg ${
                            (NUMBER_OF_LOOP / taked) * 1000
                        } / s`
                    );
                }
            });
    }
    switch (ENDPOINT) {
        case 'insert_sync':
            for (let i = 0; i < NUMBER_OF_LOOP; i++) {
                await insert();
            }
            break;
        case 'insert_sync_100':
            let items = [];
            for (let i = 0; i < NUMBER_OF_LOOP; i++) {
                items.push(insert());
                if (i % 100 === 0) {
                    await Promise.all(items);
                    items = [];
                }
            }
            break;
        case 'insert_async':
            for (let i = 0; i < NUMBER_OF_LOOP; i++) {
                insert();
            }
            break;
        case 'insert_bulk':
            for (let i = 0; i < NUMBER_OF_LOOP; i++) {
                const body = {
                    title: 'My awesome test',
                    description: 'This is a test',
                };
                insertBulker.push(body);
            }
            setInterval(() => {
                if (insertBulker.getCounter() === NUMBER_OF_LOOP) {
                    const taked = new Date() - start;
                    console.log(
                        `Taked ${taked} ms, avg ${
                            (NUMBER_OF_LOOP / taked) * 1000
                        } / s`
                    );
                    process.exit();
                }
            }, 50);
        default:
            break;
    }
}

mongoClient.connect().then(run);

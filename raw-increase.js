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

const INCREASE_BULK_TIMEOUT =
    parseInt(process.env.INCREASE_BULK_TIMEOUT, 10) || 1000;
const INCREASE_BULK_SIZE = parseInt(process.env.INCREASE_BULK_SIZE, 10) || 1000;
const INCREASE_GROUP_TIMEOUT =
    parseInt(process.env.INCREASE_GROUP_TIMEOUT, 10) || 100000;
const INCREASE_GROUP_SIZE =
    parseInt(process.env.INCREASE_GROUP_SIZE, 10) || 100000;
const INCREASE_GROUP_CHUNK_SIZE =
    parseInt(process.env.INCREASE_GROUP_CHUNK_SIZE, 10) || 100;
const MAX_ID = 1000;

const mongoClient = new MongoClient(MONGO_URI, {
    useUnifiedTopology: true,
    maxPoolSize: 100, // Set equal to concurrent request to avoid waiting for connection
    maxIdleTimeMS: 10000,
    // loggerLevel: 'debug',
});

const db = mongoClient.db(MONGO_DB_NAME);

let counter = 0;

const increaseBulker = new Bulker(
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

const groupBulker = new Bulker(
    INCREASE_GROUP_SIZE,
    INCREASE_GROUP_TIMEOUT,
    async (items) => {
        let chunk = [];
        const start = new Date();
        for (let i = 0; i < items.length; i++) {
            await (async function (item) {
                chunk.push(
                    db
                        .collection('counters')
                        .updateOne(
                            { _id: item.id },
                            { $inc: { value: 1 } },
                            { upsert: true }
                        )
                );
                if (i % INCREASE_GROUP_CHUNK_SIZE === 0) {
                    await Promise.all(chunk);
                    chunk = [];
                }
            })(items[i]);
        }
        console.log(`Group taked ${new Date() - start} ms`);
    }
);

async function run() {
    const start = new Date();
    async function increase(body) {
        await db
            .collection('counters')
            .updateOne(
                { _id: body.id },
                { $inc: { value: 1 } },
                { upsert: true }
            )
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
        case 'increase_sync':
            for (let i = 0; i < NUMBER_OF_LOOP; i++) {
                await increase({
                    id: Math.floor(Math.random() * MAX_ID),
                    title: 'My awesome test',
                    description: 'This is a test',
                });
            }
            break;
        case 'increase_async':
            for (let i = 0; i < NUMBER_OF_LOOP; i++) {
                increase({
                    id: Math.floor(Math.random() * MAX_ID),
                    title: 'My awesome test',
                    description: 'This is a test',
                });
            }
            break;
        case 'increase_group':
            for (let i = 0; i < NUMBER_OF_LOOP; i++) {
                groupBulker.push({
                    id: Math.floor(Math.random() * MAX_ID),
                    title: 'My awesome test',
                    description: 'This is a test',
                });
            }
            break;
        case 'increase_bulk':
            for (let i = 0; i < NUMBER_OF_LOOP; i++) {
                increaseBulker.push({
                    id: Math.floor(Math.random() * MAX_ID),
                    title: 'My awesome test',
                    description: 'This is a test',
                });
            }
            setInterval(() => {
                if (increaseBulker.getCounter() === NUMBER_OF_LOOP) {
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

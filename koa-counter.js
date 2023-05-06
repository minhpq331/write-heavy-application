const path = require('path');
const dotenv = require('dotenv-safe');
const Koa = require('koa');
const KoaRouter = require('koa-router');
const bodyParser = require('koa-bodyparser');
const { MongoClient } = require('mongodb');
const _ = require('lodash');
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

const app = new Koa();
const router = new KoaRouter();

app.use(bodyParser());

// Init bulk operations

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

router.post('/increase_sync', async (ctx, next) => {
    const body = ctx.request.body;
    await db
        .collection('counters')
        .updateOne({ _id: body.id }, { $inc: { value: 1 } }, { upsert: true });
    ctx.response.body = 'Ok';
    next();
});

router.post('/increase_async', async (ctx, next) => {
    const body = ctx.request.body;
    db.collection('counters').updateOne(
        { _id: body.id },
        { $inc: { value: 1 } },
        { upsert: true }
    );
    ctx.response.body = 'Ok';
    next();
});

router.post('/increase_bulk', async (ctx, next) => {
    const body = ctx.request.body;
    counterBulker.push(body);
    ctx.response.body = 'Ok';
    next();
});

router.post('/increase_reduce_bulk', async (ctx, next) => {
    const body = ctx.request.body;
    counterReduceBulker.push(body);
    ctx.response.body = 'Ok';
    next();
});

// Empty GET request to test overhead of framework

router.get('/', async (ctx, next) => {
    ctx.response.body = 'Ok';
    next();
});

// Empty POST request to test base network latency

router.post('/', async (ctx, next) => {
    ctx.response.body = 'Ok';
    next();
});

app.use(router.routes());

mongoClient.connect((err) => {
    if (err) {
        console.error(err);
        process.exit(1);
    }
    app.listen(PORT, () => {
        console.log(`Application is listening at http://localhost:${PORT}`);
    });
});

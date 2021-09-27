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

const app = new Koa();
const router = new KoaRouter();

app.use(bodyParser());

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

router.post('/insert_sync', async (ctx, next) => {
    const body = ctx.request.body;
    await db.collection('logs').insertOne(body);
    ctx.response.body = 'Ok';
    next();
});

router.post('/insert_group', async (ctx, next) => {
    const body = ctx.request.body;
    groupBulker.push(body);
    ctx.response.body = 'Ok';
    next();
});

router.post('/insert_async', async (ctx, next) => {
    const body = ctx.request.body;
    db.collection('logs').insertOne(body);
    ctx.response.body = 'Ok';
    next();
});

router.post('/insert_bulk', async (ctx, next) => {
    const body = ctx.request.body;
    insertBulker.push(body);
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
